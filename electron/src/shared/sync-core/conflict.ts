import { Note } from '../types/Note';

export interface ConflictResolutionResult {
  shouldUpdate: boolean;
  reason: string;
}

export class ConflictResolver {
  static resolveLastWriteWins(
    local: Note | null,
    server: Note
  ): ConflictResolutionResult {
    if (!local) {
      return {
        shouldUpdate: true,
        reason: 'Local note does not exist',
      };
    }

    const localTime = new Date(local.updated_at).getTime();
    const serverTime = new Date(server.updated_at).getTime();

    if (serverTime > localTime) {
      return {
        shouldUpdate: true,
        reason: `Server version is newer (server: ${server.updated_at}, local: ${local.updated_at})`,
      };
    }

    return {
      shouldUpdate: false,
      reason: `Local version is newer or equal (local: ${local.updated_at}, server: ${server.updated_at})`,
    };
  }

  static isDeletedConflict(local: Note, server: Note): boolean {
    return local.deleted !== server.deleted;
  }

  static resolveDeletedConflict(
    local: Note,
    server: Note
  ): ConflictResolutionResult {
    // deleted_version 기반 충돌 해결
    if (server.deleted_version > local.deleted_version) {
      return {
        shouldUpdate: true,
        reason: `Server has higher deleted_version (server: ${server.deleted_version}, local: ${local.deleted_version})`,
      };
    }

    if (server.deleted_version < local.deleted_version) {
      return {
        shouldUpdate: false,
        reason: `Local has higher deleted_version (local: ${local.deleted_version}, server: ${server.deleted_version})`,
      };
    }

    // 같은 버전이면 updatedAt 기준 LWW
    return this.resolveLastWriteWins(local, server);
  }

  static mergeNote(local: Note, server: Note): Note {
    const isDeleteConflict = this.isDeletedConflict(local, server);

    if (isDeleteConflict) {
      const resolution = this.resolveDeletedConflict(local, server);
      if (resolution.shouldUpdate) {
        return server;
      }
      return local;
    }

    // 단순 LWW
    const resolution = this.resolveLastWriteWins(local, server);
    if (resolution.shouldUpdate) {
      return server;
    }

    return local;
  }
}
