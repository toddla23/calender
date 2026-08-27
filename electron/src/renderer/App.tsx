import React from 'react';

export const App: React.FC = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>캘린더</h1>
      <p>Phase 2-1 Electron 클라이언트 구현 중...</p>
      <p>
        ✅ SQLite + 오프라인 CRUD<br />
        ✅ sync-core 라이브러리 (Push/Pull, LWW, Tombstone)<br />
        ✅ IPC 핸들러 (CRUD, Sync, Network)<br />
        ⏳ UI 컴포넌트 (월간 캘린더, 메모 입력)<br />
        ⏳ 네트워크 감지 및 자동 동기화<br />
        ⏳ Google OAuth 로그인<br />
      </p>
    </div>
  );
};

export default App;
