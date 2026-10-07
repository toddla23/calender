/** main ↔ renderer IPC 채널 이름 */
export const CH = {
  getSnapshot: 'cal:get-snapshot',
  listNotes: 'cal:list-notes',
  searchNotes: 'cal:search-notes',
  createNote: 'cal:create-note',
  updateNote: 'cal:update-note',
  deleteNote: 'cal:delete-note',
  restoreNote: 'cal:restore-note',
  getHolidays: 'cal:get-holidays',
  syncNow: 'cal:sync-now',
  loginGoogle: 'cal:login-google',
  cancelLogin: 'cal:cancel-login',
  loginDev: 'cal:login-dev',
  logout: 'cal:logout',
  setSettings: 'cal:set-settings',
  setServerUrl: 'cal:set-server-url',
  hideWindow: 'cal:hide-window',
  netHint: 'cal:net-hint',
  // main → renderer 이벤트
  evSnapshot: 'cal:ev-snapshot',
  evNotesChanged: 'cal:ev-notes-changed',
  evHolidaysChanged: 'cal:ev-holidays-changed',
} as const;
