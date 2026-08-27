import React, { useEffect, useState } from 'react';
import { useSyncStore } from '../store/sync';
import styles from './SyncStatus.module.css';

export const SyncStatus: React.FC = () => {
  const { syncing, stage, error, networkStatus, unsyncedCount } = useSyncStore();
  const [displayError, setDisplayError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setDisplayError(error);
      const timer = setTimeout(() => setDisplayError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const isOnline = networkStatus?.online ?? true;

  return (
    <div className={styles.statusBar}>
      <div className={styles.left}>
        <div className={styles.networkStatus}>
          <span className={`${styles.dot} ${isOnline ? styles.online : styles.offline}`} />
          <span>{isOnline ? '온라인' : '오프라인'}</span>
        </div>
      </div>

      <div className={styles.center}>
        {syncing && (
          <div className={styles.syncing}>
            <span className={styles.spinner} />
            <span>
              {stage === 'pushing' ? '업로드 중...' : stage === 'pulling' ? '다운로드 중...' : '동기화 중...'}
            </span>
          </div>
        )}
      </div>

      <div className={styles.right}>
        {unsyncedCount > 0 && !syncing && (
          <div className={styles.unsynced}>
            <span className={styles.badge}>{unsyncedCount}</span>
            <span>미동기</span>
          </div>
        )}
        {displayError && (
          <div className={styles.error}>
            <span title={displayError}>⚠️ 오류 발생</span>
          </div>
        )}
      </div>
    </div>
  );
};
