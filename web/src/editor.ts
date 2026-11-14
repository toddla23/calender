import { COLORS, type ColorKey } from '../../server/src/protocol';
import type { SyncEngine } from './sync/engine';
import { isTouchUI } from './calendar';
import { formatDateKo } from './dates';

export const COLOR_LABELS: Record<ColorKey, string> = {
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  blue: '파랑',
  purple: '보라',
  gray: '회색',
};

/**
 * 날짜 칸 편집기. 데스크톱은 칸 위에 바로 겹쳐 뜨고, 모바일은 아래에서 올라오는 시트.
 * 포커스가 빠지면 자동 저장한다.
 */
export class Editor {
  private root = document.getElementById('editor')!;
  private ta = this.root.querySelector('textarea')!;
  private backdrop = document.getElementById('backdrop')!;
  private conflictBox = this.root.querySelector<HTMLElement>('.ed-conflict')!;
  private remoteBox = this.root.querySelector<HTMLElement>('.ed-remote')!;
  private swatches = this.root.querySelector<HTMLElement>('.swatches')!;
  private state: { date: string; baseVersion: number; original: string } | null = null;

  constructor(
    private engine: SyncEngine,
    private holidayName: (date: string) => string,
    private openHistory: (date: string) => void,
  ) {
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'swatch';
    none.dataset.color = '';
    none.title = '색 없음';
    none.setAttribute('aria-label', '색 없음');
    this.swatches.append(none);
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = c;
      b.title = COLOR_LABELS[c];
      b.setAttribute('aria-label', COLOR_LABELS[c]);
      this.swatches.append(b);
    }
    this.swatches.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.swatch');
      if (!b || !this.state) return;
      const color = (b.dataset.color || null) as ColorKey | null;
      void this.engine.edit(this.state.date, { color });
      this.markSwatch(color);
      this.ta.focus();
    });

    this.root.querySelector('.ed-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.ed-history')!.addEventListener('click', () => {
      if (!this.state) return;
      const d = this.state.date;
      this.close();
      this.openHistory(d);
    });
    this.conflictBox.querySelector('button')!.addEventListener('click', async () => {
      if (!this.state) return;
      const date = this.state.date;
      await this.commit();
      await this.engine.edit(date, { resolveConflict: true });
      this.conflictBox.hidden = true;
      this.ta.focus();
    });
    this.backdrop.addEventListener('click', () => this.close());

    this.root.addEventListener('focusout', (e) => {
      const next = e.relatedTarget as Node | null;
      if (next && this.root.contains(next)) return;
      // 포커스가 편집기 밖으로 나가면 저장. 데스크톱은 닫기까지.
      setTimeout(() => {
        if (!this.state || this.root.contains(document.activeElement)) return;
        if (isTouchUI()) void this.commit();
        else this.close();
      }, 0);
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        this.close();
      }
    });
    window.addEventListener('resize', () => this.state && !isTouchUI() && this.close());
  }

  get openDate() {
    return this.state?.date ?? null;
  }

  open(date: string, cell: HTMLElement) {
    if (this.state) this.close();
    const v = this.engine.view(date);
    this.state = { date, baseVersion: v.version, original: v.content };
    this.root.querySelector('.ed-date')!.textContent = formatDateKo(date);
    this.root.querySelector('.ed-hol')!.textContent = this.holidayName(date);
    this.ta.value = v.content;
    this.conflictBox.hidden = !v.conflict;
    this.remoteBox.hidden = true;
    this.markSwatch(v.color);

    const sheet = isTouchUI();
    this.root.classList.toggle('sheet', sheet);
    this.backdrop.hidden = !sheet;
    this.root.hidden = false;
    if (sheet) {
      this.root.style.cssText = '';
    } else {
      const r = cell.getBoundingClientRect();
      const w = Math.min(Math.max(r.width + 40, 280), window.innerWidth - 16);
      const h = Math.min(Math.max(r.height + 60, 220), window.innerHeight - 16);
      const left = Math.min(Math.max(8, r.left - 20), window.innerWidth - w - 8);
      const top = Math.min(Math.max(8, r.top - 10), window.innerHeight - h - 8);
      this.root.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
    }
    document.dispatchEvent(new CustomEvent('deskcal:editing', { detail: true }));
    this.ta.focus();
    this.ta.setSelectionRange(this.ta.value.length, this.ta.value.length);
  }

  /** 다른 기기에서 지금 편집 중인 칸이 바뀌었으면 알려 준다 */
  onRemoteChange(dates: string[]) {
    if (!this.state || !dates.includes(this.state.date)) return;
    const v = this.engine.view(this.state.date);
    if (!v.pending && v.content !== this.state.original) this.remoteBox.hidden = false;
    this.conflictBox.hidden = !v.conflict;
  }

  async commit() {
    const st = this.state;
    if (!st) return;
    const content = this.ta.value;
    if (content !== st.original) {
      st.original = content;
      await this.engine.edit(st.date, { content }, st.baseVersion);
    }
  }

  close() {
    if (!this.state) return;
    void this.commit();
    const date = this.state.date;
    this.state = null;
    this.root.hidden = true;
    this.backdrop.hidden = true;
    document.dispatchEvent(new CustomEvent('deskcal:editing', { detail: false }));
    document.querySelector<HTMLElement>(`.cell[data-date="${date}"]`)?.focus({ preventScroll: true });
  }

  private markSwatch(color: ColorKey | null) {
    for (const b of this.swatches.children as HTMLCollectionOf<HTMLElement>) {
      b.classList.toggle('active', (b.dataset.color || null) === color);
    }
  }
}
