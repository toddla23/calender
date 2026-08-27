import { SYNC_CONSTANTS } from '../../shared/sync-core/constants';

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export class RetryUtil {
  private maxRetries: number;
  private initialDelayMs: number;
  private maxDelayMs: number;

  constructor(config: RetryConfig = {}) {
    this.maxRetries = config.maxRetries ?? SYNC_CONSTANTS.RETRY_TIMES;
    this.initialDelayMs = config.initialDelayMs ?? SYNC_CONSTANTS.INITIAL_RETRY_DELAY_MS;
    this.maxDelayMs = config.maxDelayMs ?? SYNC_CONSTANTS.MAX_RETRY_DELAY_MS;
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries - 1) {
          const delayMs = this.calculateBackoff(attempt);
          if (onRetry) {
            onRetry(attempt + 1, lastError);
          }
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.initialDelayMs * Math.pow(2, attempt);
    return Math.min(exponentialDelay, this.maxDelayMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
