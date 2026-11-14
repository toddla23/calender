import './styles.css';
import { SyncEngine, HttpError, type Status } from './sync/engine';
import { CalendarView } from './calendar';
import { Editor } from './editor';
import { showHistory, showSettings, toast } from './dialogs';
import { msUntilMidnight } from './dates';
import { getPlatform } from './platform';
import type { Me } from './api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const platform = await getPlatform();
  document.documentElement.dataset.platform = platform.kind;
  const statusEl = $('status');
  const loginEl = $('login');
  let me: Me | null = null;

  const engine = new SyncEngine(platform.kv, platform.api, {
    notes: (dates) => {
      cal.update(dates);
      editor.onRemoteChange(dates);
      renderStatus();
    },
    status: (s) => {
      renderStatus();
      if (s === 'unauthorized') showLogin(true);
    },
    holidays: () => cal.setHolidays(engine.holidays),
    message: (text, kind) => toast(text, kind, kind === 'warn' ? 8000 : 4000),
  });
  await engine.init();

  const holidayName = (date: string) =>
    engine.holidays
      .filter((x) => x.date === date)
      .map((x) => x.name)
      .join(', ');
  const cal = new CalendarView($('grid'), $('title'), engine, (date, cell) => editor.open(date, cell));
  const editor = new Editor(engine, holidayName, (date) => void showHistory(platform.api, engine, date));
  cal.build();

  function renderStatus() {
    const s: Status = engine.status;
    const label = { online: '실시간', connecting: '연결 중', offline: '오프라인', unauthorized: '로그인 필요' }[s];
    const n = engine.pendingCount();
    statusEl.dataset.status = s;
    statusEl.textContent = n ? `${label} · 대기 ${n}` : label;
    statusEl.title = n ? `서버로 보내지 못한 수정 ${n}건 (연결되면 자동 전송)` : '';
  }
  renderStatus();

  function showLogin(expired: boolean) {
    loginEl.hidden = false;
    loginEl.querySelector('.login-msg')!.textContent = expired
      ? '로그인이 만료됐습니다. 다시 로그인하면 보내지 못한 수정도 함께 전송됩니다.'
      : '본인 Google 계정으로 로그인하세요.';
    // 캐시가 있으면 달력을 보면서 나중에 로그인할 수 있게
    loginEl.classList.toggle('overlay', !engine.hasCache());
  }
  $('login-btn').addEventListener('click', async () => {
    try {
      await platform.login();
      loginEl.hidden = true;
      me = await platform.api.me().catch(() => null);
      engine.stop();
      engine.start();
    } catch (e) {
      toast(`로그인 실패: ${(e as Error).message}`, 'error');
    }
  });
  $('login-later').addEventListener('click', () => (loginEl.hidden = true));

  // 헤더
  $('prev').addEventListener('click', () => cal.go(-1));
  $('next').addEventListener('click', () => cal.go(1));
  $('today').addEventListener('click', () => cal.goToday());
  $('settings').addEventListener('click', () =>
    showSettings(
      platform.api,
      engine,
      me,
      async () => {
        await platform.api.logout().catch(() => {});
        engine.stop();
        await platform.clearLocal();
        location.reload();
      },
      platform.settingsExtras,
    ),
  );
  document.addEventListener('keydown', (e) => {
    if (editor.openDate || document.querySelector('dialog[open]')) return;
    if (e.key === 'PageUp') cal.go(-1);
    else if (e.key === 'PageDown') cal.go(1);
  });

  // 연결 관리: 폴링 없이 이벤트로만
  window.addEventListener('online', () => engine.reconnectNow());
  window.addEventListener('offline', () => engine.dropConnection());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) engine.reconnectNow();
  });

  // 상시 타이머는 자정에 오늘 표시를 옮기는 것 하나뿐
  const midnight = () =>
    setTimeout(() => {
      cal.refreshToday();
      midnight();
    }, msUntilMidnight());
  midnight();

  if (platform.hasCredentials?.() === false) {
    // 로그인한 적이 없으면 서버 응답을 기다리지 않고 바로 로그인 화면
    showLogin(false);
    return;
  }
  try {
    me = await platform.api.me();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      showLogin(engine.hasCache());
      return;
    }
    // 네트워크 오류: 캐시로 오프라인 동작
  }
  engine.start();
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = `앱을 시작하지 못했습니다: ${e?.message ?? e}`;
});
