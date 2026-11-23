// 관리자 화면 (/admin, F18). 보기 전용, 메모 내용은 다루지 않는다 (D-021).
// 달력 코드와 섞이지 않게 의존성 없이 혼자 돈다.
import './admin.css';

interface UserRow {
  email: string;
  admin: boolean;
  createdAt: string;
  notes: number;
  noteBytes: number;
  historyBytes: number;
  edits7d: number;
  edits30d: number;
  devices: number;
  lastActiveAt: string | null;
}
interface Stats {
  generatedAt: string;
  limits: { openSignup: boolean; maxUsers: number; quotaBytes: number; opsPerMinute: number; historyKeep: number };
  totals: {
    users: number;
    newUsers7d: number;
    activeUsers7d: number;
    notes: number;
    noteBytes: number;
    historyBytes: number;
    editsToday: number;
    edits7d: number;
    edits30d: number;
    devices: number;
  };
  daily: { date: string; edits: number; signups: number }[];
  users: UserRow[];
  server: {
    dbBytes: number;
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
    backups: number;
    latestBackup: { name: string; bytes: number; at: string } | null;
    rssBytes: number;
    uptimeSec: number;
  };
}

const SVG = 'http://www.w3.org/2000/svg';
const app = document.getElementById('app')!;
const tip = document.getElementById('tip')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

// ---------- 숫자 형식 ----------
const nf = new Intl.NumberFormat('ko-KR');
const num = (n: number) => nf.format(n);
function bytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)}MB`;
  return `${(b / 1024 ** 3).toFixed(1)}GB`;
}
function dateTime(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function ago(s: string | null): string {
  if (!s) return '-';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${m}분` : `${m}분`;
}
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function meter(ratio: number, label: string): HTMLElement {
  const m = el('div', ratio >= 0.8 ? 'meter warn' : 'meter');
  m.setAttribute('role', 'meter');
  m.setAttribute('aria-valuemin', '0');
  m.setAttribute('aria-valuemax', '100');
  m.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  m.setAttribute('aria-label', label);
  const fill = el('span');
  fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  m.append(fill);
  return m;
}

// ---------- 숫자 타일 ----------
function tile(label: string, value: string, sub?: string, extra?: Node): HTMLElement {
  const t = el('div', 'card tile', el('div', 'label', label), el('div', 'value', value));
  if (sub) t.append(el('div', 'sub', sub));
  if (extra) t.append(extra);
  return t;
}

// ---------- 막대 그래프 (단일 계열, 30일) ----------
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function columnChart(data: { date: string; value: number }[], unit: string): HTMLElement {
  const box = el('div', 'chart');
  const draw = () => {
    box.replaceChildren();
    const W = Math.max(280, box.clientWidth || 600);
    const H = 180;
    const padL = 32;
    const padR = 8;
    const padT = 16;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const max = niceMax(Math.max(...data.map((d) => d.value), 0));
    const y = (v: number) => padT + plotH - (v / max) * plotH;
    const slot = plotW / data.length;
    const barW = Math.max(2, Math.min(24, slot - 2)); // 막대 사이 2px 이상 비움
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img' });

    // 가로 격자와 눈금 (0, 절반, 최대)
    for (const v of [0, max / 2, max]) {
      const yy = Math.round(y(v)) + 0.5;
      root.append(svg('line', { class: v === 0 ? 'base' : 'grid', x1: padL, x2: W - padR, y1: yy, y2: yy }));
      const t = svg('text', { x: padL - 6, y: yy + 4, 'text-anchor': 'end' });
      t.textContent = num(v);
      root.append(t);
    }
    // x 축: 일주일 간격 + 마지막 날
    data.forEach((d, i) => {
      if ((data.length - 1 - i) % 7 !== 0) return;
      const t = svg('text', { x: padL + slot * i + slot / 2, y: H - 6, 'text-anchor': 'middle' });
      t.textContent = i === data.length - 1 ? '오늘' : md(d.date);
      root.append(t);
    });

    data.forEach((d, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      if (d.value > 0) {
        const top = y(d.value);
        const h = padT + plotH - top;
        const r = Math.min(4, barW / 2, h);
        // 위쪽만 둥근 막대 (바닥은 각지게)
        const p = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
        root.append(svg('path', { class: 'bar', d: p }));
      }
      // 마우스·키보드용 넓은 영역
      const hit = svg('rect', { class: 'hit', x: padL + slot * i, y: padT, width: slot, height: plotH, tabindex: 0 });
      hit.setAttribute('aria-label', `${d.date} ${num(d.value)}${unit}`);
      const show = (cx: number, cy: number) => {
        tip.replaceChildren(el('b', '', `${num(d.value)}${unit}`), document.createTextNode(` ${d.date}`));
        tip.hidden = false;
        const r = tip.getBoundingClientRect();
        tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, cx - r.width / 2))}px`;
        tip.style.top = `${Math.max(8, cy - r.height - 12)}px`;
      };
      hit.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
      hit.addEventListener('pointerleave', () => (tip.hidden = true));
      hit.addEventListener('focus', () => {
        const b = hit.getBoundingClientRect();
        show(b.left + b.width / 2, b.top + (y(d.value) - padT));
      });
      hit.addEventListener('blur', () => (tip.hidden = true));
      root.append(hit);
    });

    // 오늘 값만 직접 표시
    const last = data[data.length - 1];
    if (last && last.value > 0) {
      const t = svg('text', { class: 'cap', x: padL + slot * (data.length - 1) + slot / 2, y: y(last.value) - 4, 'text-anchor': 'middle' });
      t.textContent = num(last.value);
      root.append(t);
    }
    box.append(root);
  };
  new ResizeObserver(() => draw()).observe(box);
  return box;
}

function tableView(data: { date: string; value: number }[], header: string): HTMLElement {
  const t = el('table');
  const head = el('tr', '', el('th', '', '날짜'), el('th', 'num', header));
  t.append(el('thead', '', head));
  const body = el('tbody');
  for (const d of [...data].reverse()) body.append(el('tr', '', el('td', '', d.date), el('td', 'num', num(d.value))));
  t.append(body);
  return el('details', '', el('summary', '', '표로 보기'), el('div', 'table-wrap', t));
}

function chartCard(title: string, sub: string, data: { date: string; value: number }[], unit: string, header: string) {
  return el('div', 'card', el('h2', '', title), el('div', 'muted', sub), columnChart(data, unit), tableView(data, header));
}

// ---------- 사용자 표 ----------
type SortKey = keyof UserRow;
const COLUMNS: { key: SortKey; label: string; num?: boolean; render: (u: UserRow, s: Stats) => (Node | string)[] }[] = [
  { key: 'email', label: '이메일', render: (u) => [u.email, ...(u.admin ? [el('span', 'badge', '관리자')] : [])] },
  { key: 'createdAt', label: '가입', render: (u) => [dateTime(u.createdAt).slice(0, 10)] },
  { key: 'lastActiveAt', label: '마지막 사용', render: (u) => [ago(u.lastActiveAt)] },
  { key: 'devices', label: '기기', num: true, render: (u) => [num(u.devices)] },
  { key: 'notes', label: '메모 칸', num: true, render: (u) => [num(u.notes)] },
  {
    key: 'noteBytes',
    label: '메모 용량',
    num: true,
    render: (u, s) => (u.admin ? [bytes(u.noteBytes)] : [bytes(u.noteBytes), meter(u.noteBytes / s.limits.quotaBytes, `${u.email} 메모 용량`)]),
  },
  {
    key: 'historyBytes',
    label: '이력 용량',
    num: true,
    render: (u, s) =>
      u.admin ? [bytes(u.historyBytes)] : [bytes(u.historyBytes), meter(u.historyBytes / s.limits.quotaBytes, `${u.email} 이력 용량`)],
  },
  { key: 'edits7d', label: '저장 7일', num: true, render: (u) => [num(u.edits7d)] },
  { key: 'edits30d', label: '저장 30일', num: true, render: (u) => [num(u.edits30d)] },
];

function usersTable(s: Stats): HTMLElement {
  let sortKey: SortKey = 'lastActiveAt';
  let desc = true;
  const table = el('table');
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);

  const render = () => {
    const tr = el('tr');
    for (const c of COLUMNS) {
      const th = el('th', c.num ? 'num' : '');
      const b = el('button', '', c.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (sortKey === c.key) desc = !desc;
        else {
          sortKey = c.key;
          desc = c.key !== 'email';
        }
        render();
      });
      if (sortKey === c.key) th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      th.append(b);
      tr.append(th);
    }
    thead.replaceChildren(tr);
    const rows = [...s.users].sort((a, b) => {
      const x = a[sortKey] ?? '';
      const y = b[sortKey] ?? '';
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return desc ? -r : r;
    });
    tbody.replaceChildren(
      ...rows.map((u) => el('tr', '', ...COLUMNS.map((c) => el('td', c.num ? 'num' : '', ...c.render(u, s))))),
    );
  };
  render();
  return el('div', 'table-wrap', table);
}

// ---------- 화면 ----------
function render(s: Stats) {
  const t = s.totals;
  const L = s.limits;
  document.getElementById('generated')!.textContent = `${dateTime(s.generatedAt)} 기준`;

  const userSub = L.openSignup ? `가입 한도 ${num(L.maxUsers)}명` : '허용 목록 모드';
  const tiles = el(
    'div',
    'tiles',
    tile('사용자', num(t.users), userSub, L.openSignup ? meter(t.users / L.maxUsers, '가입 인원') : undefined),
    tile('최근 7일 사용', num(t.activeUsers7d), `새 사용자 ${num(t.newUsers7d)}명`),
    tile('메모 칸', num(t.notes), `로그인된 기기 ${num(t.devices)}대`),
    tile('저장 요청 오늘', num(t.editsToday), `7일 ${num(t.edits7d)} · 30일 ${num(t.edits30d)}`),
    tile('저장 용량', bytes(t.noteBytes + t.historyBytes), `메모 ${bytes(t.noteBytes)} · 이력 ${bytes(t.historyBytes)}`),
  );

  const charts = el(
    'div',
    'charts',
    chartCard(
      '날짜별 저장 요청',
      '최근 30일. 모든 사용자의 저장(가져오기 포함) 횟수',
      s.daily.map((d) => ({ date: d.date, value: d.edits })),
      '건',
      '저장 요청',
    ),
    chartCard(
      '날짜별 새 사용자',
      '최근 30일. 처음 로그인한 계정 수',
      s.daily.map((d) => ({ date: d.date, value: d.signups })),
      '명',
      '새 사용자',
    ),
  );

  const sv = s.server;
  const kv = el('dl', 'kv');
  const add = (k: string, ...v: (Node | string)[]) => kv.append(el('dt', '', k), el('dd', '', ...v));
  if (sv.diskFreeBytes !== null && sv.diskTotalBytes) {
    const used = 1 - sv.diskFreeBytes / sv.diskTotalBytes;
    add('디스크', `여유 ${bytes(sv.diskFreeBytes)} / 전체 ${bytes(sv.diskTotalBytes)}`, meter(used, '디스크 사용률'));
  }
  add('DB 크기', bytes(sv.dbBytes));
  add('백업', sv.latestBackup ? `${num(sv.backups)}개 · 최근 ${dateTime(sv.latestBackup.at)} (${bytes(sv.latestBackup.bytes)})` : `${num(sv.backups)}개`);
  add('서버 메모리', bytes(sv.rssBytes));
  add('가동 시간', duration(sv.uptimeSec));
  add(
    '한도 (관리자 제외)',
    `메모·이력 각각 ${bytes(L.quotaBytes)} · 1분 ${num(L.opsPerMinute)}건 · 칸당 이력 ${num(L.historyKeep)}개`,
  );

  app.replaceChildren(
    tiles,
    el('section', '', charts),
    el(
      'section',
      '',
      el(
        'div',
        'card',
        el('h2', '', `사용자 ${num(t.users)}명`),
        el('div', 'muted', '메모 내용은 보이지 않습니다. 제목을 누르면 정렬합니다.'),
        usersTable(s),
      ),
    ),
    el('section', '', el('div', 'card', el('h2', '', '서버'), kv)),
  );
}

function notice(title: string, msg: string, link?: [string, string]) {
  const box = el('div', 'card notice', el('h2', '', title), el('p', 'muted', msg));
  if (link) {
    const a = el('a', 'btn', link[1]);
    a.href = link[0];
    box.append(a);
  }
  app.replaceChildren(box);
}

async function load() {
  let res: Response;
  try {
    res = await fetch('/api/admin/stats', { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return notice('서버에 연결할 수 없습니다', '네트워크를 확인하고 새로고침하세요.');
  }
  if (res.status === 401) return notice('로그인이 필요합니다', '달력에서 관리자 계정으로 로그인한 뒤 다시 여세요.', ['/', '달력에서 로그인']);
  if (res.status === 403) return notice('관리자만 볼 수 있습니다', '이 계정은 관리자가 아닙니다.', ['/', '달력으로']);
  if (!res.ok) return notice('불러오지 못했습니다', `HTTP ${res.status}`);
  render((await res.json()) as Stats);
}

document.getElementById('reload')!.addEventListener('click', () => void load());
void load();
