import { useState } from 'react';
import type { AppSnapshot } from '../../../shared/types';

const api = window.calendarApi;

const LABEL: Record<AppSnapshot['status'], string> = {
  idle: '동기화됨',
  syncing: '동기화 중…',
  offline: '오프라인',
  error: '동기화 오류',
  'auth-expired': '재로그인 필요',
};

export function StatusBar({ snap }: { snap: AppSnapshot }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const label =
    snap.status === 'syncing' && snap.pullReceived !== null ? `내려받는 중… ${snap.pullReceived}건` : LABEL[snap.status];

  return (
    <>
      {snap.warning && snap.warning !== dismissed && (
        <div className="warn" onClick={() => setDismissed(snap.warning)} title="클릭하여 닫기">
          ⚠ {snap.warning}
        </div>
      )}
      <div className="statusbar">
        <span className={`dot-status ${snap.status}`} />
        <span>{label}</span>
        {snap.unsynced > 0 && <span className="pending-count">미반영 {snap.unsynced}건</span>}
        <span className="spacer" />
        <button
          className="text-btn"
          disabled={busy || snap.status === 'syncing'}
          onClick={async () => {
            setBusy(true);
            try {
              await api.syncNow();
            } finally {
              setBusy(false);
            }
          }}
        >
          지금 동기화
        </button>
      </div>
    </>
  );
}
