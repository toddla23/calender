import { useState } from 'react';
import type { AppSnapshot } from '../../../shared/types';

const api = window.calendarApi;

export function LoginView({ snap, expired }: { snap: AppSnapshot; expired: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? '로그인에 실패했습니다');
  };

  return (
    <div className="login">
      <h2>{expired ? '다시 로그인해 주세요' : '로그인'}</h2>
      <p className="muted">
        {expired
          ? '인증이 만료되었습니다. 기기에 저장된 메모는 그대로 유지되며, 같은 계정으로 로그인하면 이어서 동기화됩니다.'
          : '메모를 기기 간에 동기화하려면 Google 계정으로 로그인하세요.'}
      </p>

      {snap.login.googleConfigured ? (
        <>
          <button className="primary wide" disabled={busy} onClick={() => void run(() => api.loginGoogle())}>
            {busy ? '브라우저에서 로그인을 완료하세요…' : 'Google로 로그인'}
          </button>
          {busy && (
            <button className="text-btn" onClick={() => void api.cancelLogin()}>
              취소
            </button>
          )}
        </>
      ) : (
        <div className="notice">
          Google 로그인이 설정되지 않았습니다. 환경변수 <code>GOOGLE_CLIENT_ID</code>
          (필요 시 <code>GOOGLE_CLIENT_SECRET</code>)를 지정하거나 사용자 데이터 폴더의 <code>google-oauth.json</code>에
          설정하세요. 자세한 방법은 README를 참고하세요.
        </div>
      )}

      {snap.login.devLogin && (
        <form
          className="dev-login"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.loginDev(email));
          }}
        >
          <div className="muted">개발용 로그인 (CALENDAR_DEV_LOGIN=1)</div>
          <input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary" disabled={busy || !email}>
            개발 로그인
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}
      <div className="muted small">서버: {snap.serverUrl}</div>
    </div>
  );
}
