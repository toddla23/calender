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
};

contextBridge.exposeInMainWorld('electron', electronAPI);
