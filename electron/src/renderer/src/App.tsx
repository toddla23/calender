import { useEffect, useMemo, useState } from 'react';
import { addMonths, buildMonthGrid, todayYmd, yearsInGrid } from '../../shared/dates';
import { CalendarGrid } from './components/CalendarGrid';
import { DayPanel } from './components/DayPanel';
import { LoginView } from './components/LoginView';
import { SearchPanel } from './components/SearchPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { useHolidays, useNetHints, useNotesInRange, useSnapshot } from './hooks';

const api = window.calendarApi;

export function App() {
  const snap = useSnapshot();
  useNetHints();

  const [today, setToday] = useState(todayYmd());
  const [ym, setYm] = useState(() => {
    const t = todayYmd();
    return { y: +t.slice(0, 4), m: +t.slice(5, 7) };
  });
  const [selected, setSelected] = useState(today);
  const [searching, setSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 자정이 지나면 "오늘" 갱신 (로컬 날짜 기준)
  useEffect(() => {
    const id = setInterval(() => setToday(todayYmd()), 30_000);
    return () => clearInterval(id);
  }, []);

  const grid = useMemo(() => buildMonthGrid(ym.y, ym.m), [ym]);
  const loggedIn = !!snap?.auth.loggedIn && snap.status !== 'auth-expired';
  const notes = useNotesInRange(grid[0].date, grid[41].date, false, loggedIn);
  const holidays = useHolidays(useMemo(() => yearsInGrid(grid), [grid]));

  // 글자 크기 반영
  useEffect(() => {
    if (snap) document.documentElement.style.setProperty('--fs', `${snap.settings.fontSize}px`);
  }, [snap?.settings.fontSize]);

  if (!snap) return <div className="boot">불러오는 중…</div>;

  if (!loggedIn) {
    return (
      <div className="widget">
        <div className="titlebar">
          <span className="title">캘린더</span>
          <span className="spacer" />
          <button className="icon-btn" title="숨기기" onClick={() => void api.hideWindow()}>
            ✕
          </button>
        </div>
        <LoginView snap={snap} expired={snap.status === 'auth-expired' || (!snap.auth.loggedIn && snap.unsynced > 0)} />
      </div>
    );
  }

  const go = (date: string) => {
    setSelected(date);
    setYm({ y: +date.slice(0, 4), m: +date.slice(5, 7) });
  };

  return (
    <div className={`widget ${snap.settings.locked ? 'locked' : ''}`}>
      <div className="titlebar">
        <button className="icon-btn" title="이전 달" onClick={() => setYm(addMonths(ym, -1))}>
          ‹
        </button>
        <span className="title">
          {ym.y}년 {ym.m}월
        </span>
        <button className="icon-btn" title="다음 달" onClick={() => setYm(addMonths(ym, 1))}>
          ›
        </button>
        <button
          className="text-btn"
          onClick={() => {
            go(today);
            setSearching(false);
          }}
        >
          오늘
        </button>
        <span className="spacer" />
        <button className={`icon-btn ${searching ? 'on' : ''}`} title="검색" onClick={() => setSearching((v) => !v)}>
          🔍
        </button>
        <button className="icon-btn" title="설정" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
        <button className="icon-btn" title="숨기기 (트레이에서 다시 열기)" onClick={() => void api.hideWindow()}>
          ✕
        </button>
      </div>

      <CalendarGrid grid={grid} notes={notes} holidays={holidays} today={today} selected={selected} onSelect={go} />

      {searching ? (
        <SearchPanel
          onPick={(d) => {
            go(d);
            setSearching(false);
          }}
        />
      ) : (
        <DayPanel date={selected} holidayName={holidays.get(selected)} />
      )}

      <StatusBar snap={snap} />
      {showSettings && <SettingsPanel snap={snap} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
