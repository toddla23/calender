import type { Api, Me } from './api';
import type { SyncEngine } from './sync/engine';
import type { ColorKey } from '../../server/src/protocol';
import { formatDateKo, formatDateTime } from './dates';
import { COLOR_LABELS } from './editor';

const REASONS: Record<string, string> = {
  edit: '수정',
  merged: '충돌 병합',
  conflict_client: '충돌 전 내 내용',
  restore: '복원',
  import: '가져오기',
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props as any;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...children);
  return el;
}

export function toast(text: string, kind: 'info' | 'warn' | 'error' = 'info', ms = 4000) {
  const box = document.getElementById('toasts')!;
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, text);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

function openDialog(title: string, body: Node[]): HTMLDialogElement {
  const dlg = h('dialog', { class: 'dlg' });
  const close = h('button', { class: 'icon-btn', type: 'button', title: '닫기', ariaLabel: '닫기' }, '✕');
  close.addEventListener('click', () => dlg.close());
  dlg.append(h('div', { class: 'dlg-head' }, h('h2', {}, title), close), h('div', { class: 'dlg-body' }, ...body));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export async function showHistory(api: Api, engine: SyncEngine, date: string) {
  const list = h('div', { class: 'hist' }, h('p', { class: 'muted' }, '불러오는 중…'));
  const dlg = openDialog(`${formatDateKo(date)} 이력`, [list]);
  let items;
  try {
    items = await api.history(date);
  } catch {
    list.replaceChildren(h('p', { class: 'muted' }, '이력은 서버에 연결돼 있을 때만 볼 수 있습니다.'));
    return;
  }
  if (!items.length) {
    list.replaceChildren(h('p', { class: 'muted' }, '이력이 없습니다.'));
    return;
  }
  const current = engine.view(date);
  list.replaceChildren(
    ...items.map((it) => {
      const btn = h('button', { type: 'button', class: 'btn small' }, '이 버전으로 복원');
      btn.disabled = it.content === current.content && it.color === current.color;
      btn.addEventListener('click', async () => {
        await engine.edit(date, { content: it.content, color: it.color as ColorKey | null, kind: 'restore' });
        toast('복원했습니다. 이전 내용도 이력에 남아 있습니다.');
        dlg.close();
      });
      const meta = [
        `v${it.version}`,
        REASONS[it.reason] ?? it.reason,
        formatDateTime(it.createdAt),
        it.device ?? '',
        it.color ? COLOR_LABELS[it.color as ColorKey] : '',
      ].filter(Boolean);
      return h(
        'div',
        { class: 'hist-item' },
        h('div', { class: 'hist-meta' }, meta.join(' · ')),
        h('pre', { class: 'hist-content' }, it.content || '(비어 있음)'),
        btn,
      );
    }),
  );
}

export interface SettingsExtras {
  /** 플랫폼별 추가 설정 (Tauri 전용 등) */
  render?: () => Node[];
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)}MB`;

export async function showSettings(
  api: Api,
  engine: SyncEngine,
  me: Me | null,
  logout: () => Promise<void>,
  extras: SettingsExtras = {},
  /** 계정을 지운 뒤 이 기기의 로컬 데이터를 정리하고 다시 시작한다 */
  afterAccountDeleted: () => Promise<void> = async () => location.reload(),
) {
  const sections: Node[] = [];

  // 계정
  const logoutBtn = h('button', { type: 'button', class: 'btn' }, '로그아웃');
  logoutBtn.addEventListener('click', async () => {
    if (!confirm('이 기기에서 로그아웃할까요? 보내지 못한 수정이 있으면 사라집니다.')) return;
    await logout();
  });
  const deleteBtn = h('button', { type: 'button', class: 'btn danger' }, '계정 삭제');
  deleteBtn.disabled = !me;
  deleteBtn.addEventListener('click', async () => {
    if (!me) return;
    const typed = prompt(
      `계정을 삭제하면 이 계정의 메모·이력·로그인된 기기가 서버에서 모두 지워지고 되돌릴 수 없습니다.
` +
        `필요하면 먼저 JSON 내보내기로 받아 두세요.

삭제하려면 이메일(${me.email})을 입력하세요.`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== me.email) return toast('이메일이 맞지 않아 삭제하지 않았습니다.', 'error');
    try {
      await api.deleteAccount(me.email);
      await afterAccountDeleted();
    } catch (e) {
      toast(`계정 삭제 실패: ${(e as Error).message}`, 'error');
    }
  });
  const usage = me
    ? me.quota === null
      ? `사용량: 메모 ${mb(me.usage.noteBytes)}, 이력 ${mb(me.usage.historyBytes)} (관리자, 제한 없음)`
      : `사용량: 메모 ${mb(me.usage.noteBytes)} / ${mb(me.quota)}, 이력 ${mb(me.usage.historyBytes)} / ${mb(me.quota)} (이력은 넘치면 오래된 것부터 지움)`
    : '';
  // 윈도우 앱(base 가 있음)은 링크를 시스템 브라우저로 열 수 없어서 주소를 글자로 보여 준다
  const privacy = api.opts.base
    ? h('span', {}, `개인정보처리방침·이용약관: ${api.opts.base}/privacy, ${api.opts.base}/terms`)
    : h(
        'span',
        {},
        h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, '개인정보처리방침'),
        ' · ',
        h('a', { href: '/terms', target: '_blank', rel: 'noopener' }, '이용약관'),
      );
  sections.push(
    h(
      'section',
      {},
      h('h3', {}, '계정'),
      h('p', {}, me ? `${me.email} (${me.device.name})` : '오프라인'),
      ...(usage ? [h('p', { class: 'muted small' }, usage)] : []),
      h('div', { class: 'btn-row' }, logoutBtn, deleteBtn),
      h('p', { class: 'muted small' }, privacy),
    ),
  );

  // 기기
  const devBox = h('div', { class: 'list' }, h('p', { class: 'muted' }, '불러오는 중…'));
  sections.push(h('section', {}, h('h3', {}, '로그인된 기기'), devBox));
  const loadDevices = async () => {
    try {
      const { devices, currentId } = await api.devices();
      devBox.replaceChildren(
        ...devices.map((d) => {
          const b = h('button', { type: 'button', class: 'btn small danger' }, d.id === currentId ? '이 기기' : '폐기');
          b.disabled = d.id === currentId;
          b.addEventListener('click', async () => {
            if (!confirm(`'${d.name}' 기기의 로그인을 해제할까요?`)) return;
            await api.revokeDevice(d.id);
            void loadDevices();
          });
          return h(
            'div',
            { class: 'row' },
            h('div', {}, h('b', {}, d.name), h('div', { class: 'muted small' }, `마지막 사용 ${formatDateTime(d.lastUsedAt)}${d.lastIp ? ' · ' + d.lastIp : ''}`)),
            b,
          );
        }),
      );
    } catch {
      devBox.replaceChildren(h('p', { class: 'muted' }, '서버에 연결돼 있을 때만 볼 수 있습니다.'));
    }
  };
  void loadDevices();

  // 임시공휴일
  const holBox = h('div', { class: 'list' });
  const renderHol = () => {
    const custom = engine.holidays.filter((x) => x.custom);
    holBox.replaceChildren(
      ...(custom.length
        ? custom.map((x) => {
            const b = h('button', { type: 'button', class: 'btn small danger' }, '삭제');
            b.disabled = !me?.admin;
            b.addEventListener('click', async () => {
              try {
                await api.removeHoliday(x.date);
                await engine.loadHolidays();
                renderHol();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            });
            return h('div', { class: 'row' }, h('span', {}, `${x.date} ${x.name}`), b);
          })
        : [h('p', { class: 'muted' }, '추가한 임시공휴일이 없습니다.')]),
    );
  };
  renderHol();
  const hDate = h('input', { type: 'date', required: true });
  const hName = h('input', { type: 'text', placeholder: '이름 (예: 임시공휴일)', maxLength: 100, required: true });
  const hForm = h('form', { class: 'inline-form' }, hDate, hName, h('button', { type: 'submit', class: 'btn' }, '추가'));
  hForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.addHoliday(hDate.value, hName.value.trim());
      await engine.loadHolidays();
      hForm.reset();
      renderHol();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  });
  sections.push(
    h(
      'section',
      {},
      h('h3', {}, '임시공휴일'),
      holBox,
      me?.admin ? hForm : h('p', { class: 'muted small' }, '임시공휴일은 모든 사용자가 함께 보며, 관리자만 추가할 수 있습니다.'),
    ),
  );

  // 데이터
  const exp = h('button', { type: 'button', class: 'btn' }, 'JSON 내보내기');
  exp.addEventListener('click', async () => {
    try {
      const res = await api.exportJson();
      const blob = await res.blob();
      const a = h('a', { href: URL.createObjectURL(blob), download: `deskcal-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast(`내보내기 실패: ${(e as Error).message}`, 'error');
    }
  });
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const imp = h('button', { type: 'button', class: 'btn' }, 'JSON 가져오기');
  imp.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast('10MB 이하 파일만 가져올 수 있습니다.', 'error');
    if (!confirm('파일에 있는 날짜의 메모를 덮어씁니다. 덮어쓴 내용은 이력에서 되돌릴 수 있습니다. 계속할까요?')) return;
    try {
      const r = await api.importJson(await f.text());
      toast(`가져오기 완료: ${r.imported}칸 반영, ${r.unchanged}칸 동일${r.errors.length ? `, 오류 ${r.errors.length}건` : ''}`);
      await engine.pullAll();
    } catch (e) {
      toast(`가져오기 실패: ${(e as Error).message}`, 'error');
    }
    file.value = '';
  });
  sections.push(
    h('section', {}, h('h3', {}, '데이터'), h('div', { class: 'btn-row' }, exp, imp, file), h('p', { class: 'muted small' }, '가져오기는 파일에 있는 날짜만 덮어씁니다.')),
  );

  if (extras.render) sections.push(...extras.render());
  openDialog('설정', sections);
}
