import { useState } from 'react';
import type { AppSnapshot } from '../../../shared/types';

const api = window.calendarApi;

export function SettingsPanel({ snap, onClose }: { snap: AppSnapshot; onClose(): void }) {
  const s = snap.settings;
  const [url, setUrl] = useState(s.serverUrl ?? snap.serverUrl);
  const [urlMsg, setUrlMsg] = useState<string | null>(null);

  const applyUrl = async () => {
    if (!window.confirm('서버 주소를 바꾸면 이 기기의 로컬 데이터가 초기화되고 로그아웃되며 앱이 다시 시작됩니다. 계속할까요?')) return;
    const r = await api.setServerUrl(url);
    if (!r.ok) setUrlMsg(r.error ?? '적용 실패');
  };

  return (
    <div className="overlay">
      <div className="sheet">
        <div className="sheet-head">
          <strong>설정</strong>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="field">
          <span>투명도 {Math.round(s.opacity * 100)}%</span>
          <input
            type="range"
            min={30}
            max={100}
            value={Math.round(s.opacity * 100)}
            onChange={(e) => void api.setSettings({ opacity: +e.target.value / 100 })}
          />
        </label>

        <label className="field">
          <span>글자 크기 {s.fontSize}px</span>
          <input
            type="range"
            min={11}
            max={18}
            value={s.fontSize}
            onChange={(e) => void api.setSettings({ fontSize: +e.target.value })}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={s.locked} onChange={(e) => void api.setSettings({ locked: e.target.checked })} />
          위젯 위치/크기 고정
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={s.autoStart}
            onChange={(e) => void api.setSettings({ autoStart: e.target.checked })}
          />
          Windows 로그인 시 자동 시작
        </label>

        <div className="field">
          <span>서버 주소</span>
          <input
            value={url}
            disabled={snap.serverUrlFromEnv}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8080"
          />
          {snap.serverUrlFromEnv ? (
            <small className="muted">환경변수 CALENDAR_SERVER_URL이 사용 중입니다</small>
          ) : (
            <button className="text-btn" onClick={() => void applyUrl()}>
              적용 (재시작)
            </button>
          )}
          {urlMsg && <div className="error">{urlMsg}</div>}
        </div>

        <div className="field">
          <span>계정: {snap.auth.email ?? '-'}</span>
          <button
            className="text-btn danger"
            onClick={async () => {
              if (window.confirm('로그아웃하면 이 기기의 메모 데이터가 삭제됩니다 (서버에 반영된 데이터는 유지). 계속할까요?')) {
                await api.logout();
                onClose();
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
