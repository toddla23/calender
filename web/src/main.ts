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
  if (platform.api.opts.base) {
    // 윈도우 앱: 링크를 열 수 없으므로 서버의 소개·약관 주소를 글자로
    $('login-links').textContent = `서비스 소개·개인정보처리방침·이용약관: ${platform.api.opts.base}/about`;
  }
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
    // 다른 탭·창에서 다른 계정으로 로그인했다 → 다시 시작해서 계정을 확인한다
    accountChanged: () => location.reload(),
  });
  await engine.init();
  platform.api.opts.expectUser = () => engine.owner;

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

  /** 로그인한 계정으로 캐시 주인을 맞춘다. 다른 계정이면 이 기기의 캐시와 큐를 비운다 */
  async function adoptAccount(m: Me) {
    const { reset, dropped } = await engine.setOwner(m.email);
    if (!reset) return;
    cal.build();
    renderStatus();
    toast(
      dropped
        ? `다른 계정으로 로그인해서 이전 계정의 캐시를 지웠습니다. 보내지 못한 수정 ${dropped}건도 지웠습니다.`
        : '다른 계정으로 로그인해서 이전 계정의 캐시를 지웠습니다.',
      'warn',
      8000,
    );
  }

  function showLogin(expired: boolean) {
    loginEl.hidden = false;
    loginEl.querySelector('.login-msg')!.textContent = expired
      ? '로그인이 만료됐습니다. 다시 로그인하면 보내지 못한 수정도 함께 전송됩니다.'
      : 'Google 계정으로 로그인하세요. 계정마다 따로 달력이 만들어집니다.';
    // 캐시가 있으면 달력을 보면서 나중에 로그인할 수 있게
    loginEl.classList.toggle('overlay', !engine.hasCache());
  }
  $('login-btn').addEventListener('click', async () => {
    try {
      await platform.login();
      loginEl.hidden = true;
      me = await platform.api.me().catch(() => null);
      engine.stop();
      if (me) await adoptAccount(me);
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
      async () => {
        engine.stop();
        await platform.clearLocal();
        location.reload();
      },
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
    await adoptAccount(me);
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
