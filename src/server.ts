/**
 * The visualizer's local server: one page, a run list, and a per-run SSE stream
 * that replays what has happened so far and then follows the run live. Finished
 * runs come off disk; live ones off their RunBus.
 */

import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { RunBus, type RunEvent } from './events.js';
import { listRecordedRuns, listStoredRuns, readRecordedEvents, readRunEvents, summariseEvents, type RunSummary } from './run-store.js';

const PAGE_URL = new URL('../ui/index.html', import.meta.url);
const OFFICE_URL = new URL('../ui/office.js', import.meta.url);
/** Keeps proxies and browsers from closing a quiet stream while an agent thinks. */
const HEARTBEAT_MS = 15_000;

export class RunRegistry {
  private readonly live = new Map<string, RunBus>();

  add(bus: RunBus): void {
    this.live.set(bus.runId, bus);
  }

  get(runId: string): RunBus | undefined {
    return this.live.get(runId);
  }

  list(): RunSummary[] {
    const stored = listStoredRuns();
    const storedIds = new Set(stored.map((r) => r.runId));
    const liveOnly = [...this.live.values()]
      .filter((bus) => !storedIds.has(bus.runId))
      .map((bus) => summariseEvents(bus.runId, bus.events))
      .filter((s): s is RunSummary => s !== null);
    return [...liveOnly, ...stored].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}

export interface ResearchServerOptions {
  registry: RunRegistry;
  /** Starts a run from the page; resolves to its id once queued. */
  startRun: (brief: string) => string;
}

export function createResearchApp({ registry, startRun }: ResearchServerOptions): Hono {
  const app = new Hono();

  // Read per request so edits to the page show on refresh during development.
  app.get('/', (c) => c.html(readFileSync(PAGE_URL, 'utf8')));
  app.get('/office.js', (c) => c.body(readFileSync(OFFICE_URL, 'utf8'), 200, { 'content-type': 'text/javascript; charset=utf-8' }));
  // Locally the page talks to its own origin; the static Vercel build ships a config.js that points here.
  app.get('/config.js', (c) => c.body('window.RESEARCH_API = "";', 200, { 'content-type': 'text/javascript; charset=utf-8' }));
  app.get('/favicon.ico', (c) => c.body(null, 204));
  // The same recorded runs the static export ships, so the page behaves identically here and on Vercel.
  app.get('/runs/index.json', (c) => c.json(listRecordedRuns()));
  app.get('/runs/:file', (c) => {
    const runId = c.req.param('file').replace(/\.json$/, '');
    const events = readRecordedEvents(runId);
    return events.length ? c.json(events) : c.json({ error: 'No recorded run with that id.' }, 404);
  });
  // The demo page may be served from another origin (Vercel) with this server behind a tunnel.
  app.use('/api/*', cors());

  app.get('/api/runs', (c) => c.json(registry.list()));

  app.post('/api/runs', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { brief?: unknown };
    const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
    if (!brief) return c.json({ error: 'Write the brief first.' }, 400);
    return c.json({ runId: startRun(brief) }, 201);
  });

  app.get('/api/runs/:id/events', (c) => {
    const runId = c.req.param('id');
    const bus = registry.get(runId);
    const stored = bus ? null : readRunEvents(runId);
    if (!bus && stored!.length === 0) return c.json({ error: 'No run with that id.' }, 404);

    return streamSSE(c, async (stream) => {
      const send = (event: RunEvent) =>
        stream.writeSSE({ id: String(event.seq), data: JSON.stringify(event) });

      if (!bus) {
        for (const event of stored!) await send(event);
        await stream.writeSSE({ event: 'done', data: '' });
        return;
      }

      // Snapshot first, then subscribe: anything emitted in between is caught by seq.
      let sent = 0;
      for (const event of bus.events) {
        await send(event);
        sent = event.seq + 1;
      }
      if (bus.isFinished) {
        await stream.writeSSE({ event: 'done', data: '' });
        return;
      }

      await new Promise<void>((resolve) => {
        const queue: RunEvent[] = [];
        let draining = false;
        const drain = async () => {
          if (draining) return;
          draining = true;
          while (queue.length) {
            const event = queue.shift()!;
            if (event.seq < sent) continue;
            await send(event);
            sent = event.seq + 1;
            if (event.type === 'run.completed' || event.type === 'run.failed') {
              await stream.writeSSE({ event: 'done', data: '' });
              finish();
            }
          }
          draining = false;
        };
        const unsubscribe = bus.subscribe((event) => {
          queue.push(event);
          void drain();
        });
        const heartbeat = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }), HEARTBEAT_MS);
        const finish = () => {
          unsubscribe();
          clearInterval(heartbeat);
          resolve();
        };
        stream.onAbort(finish);
      });
    });
  });

  return app;
}
