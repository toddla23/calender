import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/ipc';
import type { CalendarApi } from './api';

const on = (channel: string, cb: (payload?: unknown) => void) => {
  const handler = (_e: unknown, payload?: unknown) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: CalendarApi = {
  getSnapshot: () => ipcRenderer.invoke(CH.getSnapshot),
  listNotes: (from, to, includeDeleted = false) => ipcRenderer.invoke(CH.listNotes, from, to, includeDeleted),
  searchNotes: (q) => ipcRenderer.invoke(CH.searchNotes, q),
  createNote: (d) => ipcRenderer.invoke(CH.createNote, d),
  updateNote: (id, patch) => ipcRenderer.invoke(CH.updateNote, id, patch),
  deleteNote: (id) => ipcRenderer.invoke(CH.deleteNote, id),
  restoreNote: (id) => ipcRenderer.invoke(CH.restoreNote, id),
  getHolidays: (year) => ipcRenderer.invoke(CH.getHolidays, year),
  syncNow: () => ipcRenderer.invoke(CH.syncNow),
  loginGoogle: () => ipcRenderer.invoke(CH.loginGoogle),
  cancelLogin: () => ipcRenderer.invoke(CH.cancelLogin),
  loginDev: (email) => ipcRenderer.invoke(CH.loginDev, email),
  logout: () => ipcRenderer.invoke(CH.logout),
  setSettings: (patch) => ipcRenderer.invoke(CH.setSettings, patch),
  setServerUrl: (url) => ipcRenderer.invoke(CH.setServerUrl, url),
  hideWindow: () => ipcRenderer.invoke(CH.hideWindow),
  netHint: () => void ipcRenderer.invoke(CH.netHint),
  onSnapshot: (cb) => on(CH.evSnapshot, (p) => cb(p as never)),
  onNotesChanged: (cb) => on(CH.evNotesChanged, () => cb()),
  onHolidaysChanged: (cb) => on(CH.evHolidaysChanged, () => cb()),
};

contextBridge.exposeInMainWorld('calendarApi', api);
