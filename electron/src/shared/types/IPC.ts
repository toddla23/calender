import { Note, NoteInput, NoteUpdate } from './Note';
import { SyncStatus, NetworkStatus, SyncMeta } from './SyncMeta';

export interface IPCRequest {
  id?: string;
  [key: string]: any;
}

export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// CRUD IPC Channels
export const IPC_CRUD_CHANNELS = {
  CREATE_NOTE: 'crud:create-note',
  READ_NOTES: 'crud:read-notes',
  UPDATE_NOTE: 'crud:update-note',
  DELETE_NOTE: 'crud:delete-note',
  GET_NOTE_BY_DATE: 'crud:get-note-by-date',
} as const;

// Sync IPC Channels
export const IPC_SYNC_CHANNELS = {
  GET_SYNC_STATUS: 'sync:get-status',
  PUSH_NOTES: 'sync:push',
  PULL_NOTES: 'sync:pull',
  SET_AUTH_TOKENS: 'sync:set-auth-tokens',
} as const;

// Network IPC Channels
export const IPC_NETWORK_CHANNELS = {
  GET_NETWORK_STATUS: 'network:get-status',
  ON_NETWORK_CHANGE: 'network:change',
} as const;

// Events
export const IPC_EVENTS = {
  SYNC_STATUS_CHANGED: 'event:sync-status-changed',
  NETWORK_STATUS_CHANGED: 'event:network-status-changed',
  NOTES_CHANGED: 'event:notes-changed',
} as const;

// Request/Response Types
export interface CreateNoteRequest extends IPCRequest {
  note: NoteInput;
}

export interface ReadNotesRequest extends IPCRequest {
  startDate?: string;
  endDate?: string;
  includeDeleted?: boolean;
}

export interface UpdateNoteRequest extends IPCRequest {
  update: NoteUpdate;
}

export interface DeleteNoteRequest extends IPCRequest {
  id: string;
}

export interface PushNotesRequest extends IPCRequest {
  forceSync?: boolean;
}

export interface PullNotesRequest extends IPCRequest {
  cursor?: string | null;
}

export interface SetAuthTokensRequest extends IPCRequest {
  accessToken: string;
  refreshToken: string;
  userId: string;
  userEmail: string;
}
