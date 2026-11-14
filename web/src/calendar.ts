import type { Holiday } from '../../server/src/protocol';
import type { SyncEngine } from './sync/engine';
import { monthCells, todayStr } from './dates';

/**
 * 월간 그리드. 달을 바꿀 때만 42칸을 새로 만들고,
 * 메모가 바뀌면 해당 칸만 다시 그린다. 화면이 가려져 있으면 그리지 않고 모아 뒀다가 보일 때 그린다.
 */
export class CalendarView {
  year: number;
  month0: number;
  private cells = new Map<string, HTMLElement>();
  private holidayMap = new Map<string, string[]>();
  private dirty = new Set<string>();
  private today = todayStr();

  constructor(
    private grid: HTMLElement,
    private title: HTMLElement,
    private engine: SyncEngine,
    private onOpen: (date: string, cell: HTMLElement) => void,
  ) {
    const now = new Date();
    this.year = now.getFullYear();
    this.month0 = now.getMonth();
    this.buildHolidayMap(engine.holidays);

    // 이벤트 위임: 칸마다 리스너를 달지 않는다
    grid.addEventListener('dblclick', (e) => {
      if (isTouchUI()) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (cell) this.onOpen(cell.dataset.date!, cell);
    });
    grid.addEventListener('click', (e) => {
      if (!isTouchUI()) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (cell) this.onOpen(cell.dataset.date!, cell);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
      if (cell) {
        e.preventDefault();
        this.onOpen(cell.dataset.date!, cell);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.flushDirty();
    });
  }

  setHolidays(list: Holiday[]) {
    this.buildHolidayMap(list);
    for (const d of this.cells.keys()) this.markDirty(d);
  }

  private buildHolidayMap(list: Holiday[]) {
    this.holidayMap.clear();
    for (const h of list) {
      const a = this.holidayMap.get(h.date) ?? [];
      a.push(h.name);
      this.holidayMap.set(h.date, a);
    }
  }

  go(delta: number) {
    const d = new Date(this.year, this.month0 + delta, 1);
    this.setMonth(d.getFullYear(), d.getMonth());
  }

  goToday() {
    const d = new Date();
    this.setMonth(d.getFullYear(), d.getMonth());
  }

  setMonth(year: number, month0: number) {
    this.year = year;
    this.month0 = month0;
    this.build();
  }

  /** 달 전체를 만든다 (달을 바꿀 때만) */
  build() {
    this.title.textContent = `${this.year}년 ${this.month0 + 1}월`;
    this.cells.clear();
    this.dirty.clear();
    const frag = document.createDocumentFragment();
    monthCells(this.year, this.month0).forEach((date, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.date = date;
      cell.tabIndex = 0;
      cell.setAttribute('role', 'gridcell');
      const head = document.createElement('div');
      head.className = 'cell-head';
      const day = document.createElement('span');
      day.className = 'day';
      day.textContent = String(Number(date.slice(8)));
      const hol = document.createElement('span');
      hol.className = 'hol';
      const flag = document.createElement('span');
      flag.className = 'flag';
      head.append(day, hol, flag);
      const body = document.createElement('div');
      body.className = 'cell-body';
      cell.append(head, body);
      const dow = i % 7;
      if (dow === 0) cell.classList.add('sun');
      if (dow === 6) cell.classList.add('sat');
      if (Number(date.slice(5, 7)) - 1 !== this.month0) cell.classList.add('out');
      this.cells.set(date, cell);
      this.paint(date, cell);
      frag.append(cell);
    });
    this.grid.replaceChildren(frag);
  }

  /** 바뀐 날짜만 다시 그린다 */
  update(dates: string[]) {
    for (const d of dates) if (this.cells.has(d)) this.markDirty(d);
  }

  private markDirty(date: string) {
    if (document.hidden) {
      this.dirty.add(date);
      return;
    }
    const c = this.cells.get(date);
    if (c) this.paint(date, c);
  }

  private flushDirty() {
    for (const d of this.dirty) {
      const c = this.cells.get(d);
      if (c) this.paint(d, c);
    }
    this.dirty.clear();
  }

  /** 자정이 지나면 오늘 표시만 옮긴다 */
  refreshToday() {
    const prev = this.today;
    this.today = todayStr();
    for (const d of [prev, this.today]) {
      const c = this.cells.get(d);
      if (c) c.classList.toggle('today', d === this.today);
    }
  }

  private paint(date: string, cell: HTMLElement) {
    const v = this.engine.view(date);
    const hol = this.holidayMap.get(date);
    cell.classList.toggle('today', date === this.today);
    cell.classList.toggle('holiday', !!hol);
    cell.classList.toggle('conflict', v.conflict);
    cell.classList.toggle('pending', v.pending);
    cell.dataset.color = v.color ?? '';
    const [, holEl, flagEl] = cell.firstElementChild!.children as unknown as HTMLElement[];
    holEl.textContent = hol ? hol.join(', ') : '';
    holEl.title = holEl.textContent;
    flagEl.textContent = v.conflict ? '충돌' : '';
    (cell.lastElementChild as HTMLElement).textContent = v.content;
    cell.setAttribute('aria-label', `${date}${hol ? ' ' + hol.join(', ') : ''}${v.content ? ', 메모: ' + v.content.slice(0, 100) : ''}`);
  }

  cellEl(date: string) {
    return this.cells.get(date);
  }
}

export function isTouchUI(): boolean {
  return matchMedia('(max-width: 640px), (pointer: coarse)').matches;
}
