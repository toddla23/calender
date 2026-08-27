import { contextBridge, ipcRenderer } from 'electron';
import { IPCResponse } from '../shared/types/IPC';

const electronAPI = {
  ipc: {
    invoke: (channel: string, data?: any): Promise<IPCResponse> => {
      return ipcRenderer.invoke(channel, data);
    },
    on: (channel: string, callback: (data: any) => void) => {
      ipcRenderer.on(channel, (event, data) => callback(data));
    },
    once: (channel: string, callback: (data: any) => void) => {
      ipcRenderer.once(channel, (event, data) => callback(data));
    },
    off: (channel: string, callback: (data: any) => void) => {
      ipcRenderer.removeListener(channel, callback);
    },
  },
  config: {
    getConfig: (): Promise<any> => ipcRenderer.invoke('config:get'),
    updateAppearance: (backgroundColor: string, opacity: number, textColor: string, fontSize: number): Promise<void> =>
      ipcRenderer.invoke('config:update-appearance', backgroundColor, opacity, textColor, fontSize),
    updatePosition: (x: number, y: number): Promise<void> =>
      ipcRenderer.invoke('config:update-position', x, y),
    onAppearanceUpdated: (callback: (data: any) => void) => {
      ipcRenderer.on('appearance:updated', (event, data) => callback(data));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);
