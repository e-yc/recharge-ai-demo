import { describe, expect, it } from 'vitest';
import { RunBus } from './events.js';
import { parseEventLines, summariseEvents } from './run-store.js';

describe('RunBus', () => {
  it('numbers events in order and stamps them relative to the run start', () => {
    const seen: number[] = [];
    const bus = new RunBus('r1', Date.now() - 1_000, (e) => seen.push(e.seq));
    bus.emit({ type: 'run.started', runId: 'r1', brief: 'b', model: 'm', startedAt: 'now' });
    const second = bus.emit({ type: 'agent.started', agentId: 'macro' });
    expect(second.seq).toBe(1);
    expect(second.t).toBeGreaterThanOrEqual(1_000);
    expect(seen).toEqual([0, 1]);
    expect(bus.isFinished).toBe(false);
    bus.emit({ type: 'run.completed', durationMs: 5, costUsd: 0 });
    expect(bus.isFinished).toBe(true);
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const bus = new RunBus('r2');
    let count = 0;
    const off = bus.subscribe(() => count++);
    bus.emit({ type: 'agent.started', agentId: 'a' });
    off();
    bus.emit({ type: 'agent.started', agentId: 'b' });
    expect(count).toBe(1);
  });
});

describe('summariseEvents', () => {
  const started = JSON.stringify({ type: 'run.started', runId: 'x', brief: 'why?', model: 'm', startedAt: '2026-09-22T00:00:00Z', seq: 0, t: 0 });

  it('reads status and cost off the last event', () => {
    const done = JSON.stringify({ type: 'run.completed', durationMs: 10, costUsd: 1.5, seq: 1, t: 10 });
    const summary = summariseEvents('x', parseEventLines(`${started}\n${done}\n`));
    expect(summary).toEqual({ runId: 'x', brief: 'why?', startedAt: '2026-09-22T00:00:00Z', status: 'completed', costUsd: 1.5 });
  });

  it('treats a run with no terminal event as still running, and no start as no run', () => {
    expect(summariseEvents('x', parseEventLines(started))?.status).toBe('running');
    expect(summariseEvents('x', [])).toBeNull();
  });
});
