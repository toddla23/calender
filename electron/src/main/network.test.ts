import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitor } from './network';

describe('NetworkMonitor', () => {
  afterEach(() => vi.useRealTimers());

  it('상태가 바뀔 때만 onChange (최초 판정 포함)', async () => {
    const results = [true, true, false, false, true];
    const changes: boolean[] = [];
    const m = new NetworkMonitor({ ping: async () => results.shift()!, onChange: (o) => changes.push(o) });
    for (let i = 0; i < 5; i++) await m.check();
    expect(changes).toEqual([true, false, true]);
    expect(m.online).toBe(true);
  });

  it('ping이 throw 해도 오프라인으로 처리', async () => {
    const changes: boolean[] = [];
    const m = new NetworkMonitor({
      ping: async () => {
        throw new Error('x');
      },
      onChange: (o) => changes.push(o),
    });
    expect(await m.check()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('동시 호출은 한 번의 ping만 수행 (single-flight)', async () => {
    const ping = vi.fn(async () => true);
    const m = new NetworkMonitor({ ping, onChange: () => {} });
    await Promise.all([m.check(), m.check(), m.hint() as never]);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('주기적으로 확인한다 (15초)', async () => {
    vi.useFakeTimers();
    const ping = vi.fn(async () => true);
    const ticks: boolean[] = [];
    const m = new NetworkMonitor({ ping, onChange: () => {}, onTick: (o) => ticks.push(o) });
    m.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ping).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(ping).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ping).toHaveBeenCalledTimes(4);
    m.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ping).toHaveBeenCalledTimes(4);
    expect(ticks.length).toBe(4);
  });
});
