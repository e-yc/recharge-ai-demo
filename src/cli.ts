import { config } from 'dotenv';
config({ quiet: true });

import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Command, InvalidArgumentError } from 'commander';
import { RunBus, type RunEvent } from './events.js';
import { runResearchPipeline } from './pipeline.js';
import { RESEARCH_DATA_DIR, createRunSink, newRunId, readRunEvents } from './run-store.js';
import { buildSampleRun } from './sample-run.js';
import { RunRegistry, createResearchApp } from './server.js';

const DEFAULT_PORT = 4100;
/** Every agent runs on this unless RESEARCH_MODEL or --model says otherwise. */
const DEFAULT_MODEL = process.env.RESEARCH_MODEL ?? 'claude-opus-5';
const DEFAULT_MAX_FOLLOWUPS = 3;

function parsePositive(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidArgumentError(`Not a positive number: ${value}`);
  return n;
}

function openInBrowser(url: string): void {
  // Best effort only: a missing opener shouldn't stop the run. The URL is printed regardless.
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

interface Host {
  registry: RunRegistry;
  port: number;
  url: (runId?: string) => string;
}

function startHost(port: number, startRun: (brief: string) => string): Host {
  const registry = new RunRegistry();
  const app = createResearchApp({ registry, startRun });
  serve({ fetch: app.fetch, port }, () => {});
  const url = (runId?: string) => `http://localhost:${port}/${runId ? `?run=${encodeURIComponent(runId)}` : ''}`;
  return { registry, port, url };
}

function launchRun(host: Host, brief: string, model: string, maxFollowups: number): RunBus {
  const runId = newRunId();
  const bus = new RunBus(runId, Date.now(), createRunSink(runId));
  host.registry.add(bus);
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  runResearchPipeline(bus, { brief, model, maxFollowups, signal: abort.signal })
    .then((result) => {
      console.log(`\nDone in ${(result.costUsd).toFixed(2)} USD. Report: ${result.reportPath}`);
    })
    .catch((err) => console.error(`\nRun ${runId} failed: ${err instanceof Error ? err.message : err}`));
  return bus;
}

/** Re-emits recorded events on their original clock, divided by `speed`. */
function replayInto(host: Host, runId: string, events: RunEvent[], speed: number): RunBus {
  const bus = new RunBus(runId);
  host.registry.add(bus);
  const startedAt = Date.now();
  for (const event of events) {
    const delay = Math.max(0, event.t / speed - (Date.now() - startedAt));
    setTimeout(() => bus.push({ ...event, t: Math.round(event.t / speed) }), delay);
  }
  return bus;
}

const program = new Command()
  .name('research')
  .description('Multi-agent research demo: runs the crew and shows it working');

program
  .command('run')
  .description('Research a brief live and open the visualizer')
  .argument('<brief...>', 'the brand\'s question, in its own words')
  .option('--port <n>', 'visualizer port', parsePositive, DEFAULT_PORT)
  .option('--model <id>', 'model for every agent', DEFAULT_MODEL)
  .option('--max-followups <n>', 'cap on follow-up agents', parsePositive, DEFAULT_MAX_FOLLOWUPS)
  .option('--no-open', 'do not open a browser')
  .action((briefWords: string[], opts: { port: number; model: string; maxFollowups: number; open: boolean }) => {
    const brief = briefWords.join(' ').trim();
    const host = startHost(opts.port, (b) => launchRun(host, b, opts.model, opts.maxFollowups).runId);
    const bus = launchRun(host, brief, opts.model, opts.maxFollowups);
    const url = host.url(bus.runId);
    console.log(url);
    console.log(`Run ${bus.runId} on ${opts.model}. The server stays up after the run; Ctrl-C to stop.`);
    if (opts.open) openInBrowser(url);
  });

program
  .command('serve')
  .description('Serve the visualizer for past runs (and new ones started from the page)')
  .option('--port <n>', 'visualizer port', parsePositive, DEFAULT_PORT)
  .option('--model <id>', 'model for runs started from the page', DEFAULT_MODEL)
  .option('--open', 'open a browser')
  .action((opts: { port: number; model: string; open?: boolean }) => {
    const host = startHost(opts.port, (b) => launchRun(host, b, opts.model, DEFAULT_MAX_FOLLOWUPS).runId);
    console.log(host.url());
    if (opts.open) openInBrowser(host.url());
  });

program
  .command('replay')
  .description('Replay a recorded run on its original clock — no agents, no cost')
  .argument('<runId>', 'a directory name under data/research')
  .option('--speed <n>', 'time compression, e.g. 4 = four times faster', parsePositive, 1)
  .option('--port <n>', 'visualizer port', parsePositive, DEFAULT_PORT)
  .option('--no-open', 'do not open a browser')
  .action((runId: string, opts: { speed: number; port: number; open: boolean }) => {
    const events = readRunEvents(runId);
    if (events.length === 0) {
      console.error(`No recorded run named ${runId}.`);
      process.exitCode = 1;
      return;
    }
    const host = startHost(opts.port, (b) => launchRun(host, b, DEFAULT_MODEL, DEFAULT_MAX_FOLLOWUPS).runId);
    const bus = replayInto(host, `${runId}~replay`, events, opts.speed);
    const url = host.url(bus.runId);
    console.log(url);
    if (opts.open) openInBrowser(url);
  });

program
  .command('export')
  .description('Write the page as a static site that talks to a run server elsewhere (e.g. this machine behind a tunnel)')
  .requiredOption('--api <url>', 'public URL of the run server, e.g. https://xyz.trycloudflare.com')
  .option('--out <dir>', 'output directory', join(RESEARCH_DATA_DIR, '..', '..', 'site'))
  .action((opts: { api: string; out: string }) => {
    const ui = new URL('../ui/', import.meta.url);
    mkdirSync(opts.out, { recursive: true });
    copyFileSync(new URL('index.html', ui), join(opts.out, 'index.html'));
    copyFileSync(new URL('office.js', ui), join(opts.out, 'office.js'));
    writeFileSync(join(opts.out, 'config.js'), `window.RESEARCH_API = ${JSON.stringify(opts.api.replace(/\/$/, ''))};\n`);
    console.log(opts.out);
  });

program
  .command('sample')
  .description('Play the built-in made-up run to preview the visualizer without any API calls')
  .option('--speed <n>', 'time compression', parsePositive, 1)
  .option('--port <n>', 'visualizer port', parsePositive, DEFAULT_PORT)
  .option('--no-open', 'do not open a browser')
  .action((opts: { speed: number; port: number; open: boolean }) => {
    const host = startHost(opts.port, (b) => launchRun(host, b, DEFAULT_MODEL, DEFAULT_MAX_FOLLOWUPS).runId);
    const runId = `sample-${Date.now().toString(36)}`;
    const bus = replayInto(host, runId, buildSampleRun(runId), opts.speed);
    const url = host.url(bus.runId);
    console.log(url);
    if (opts.open) openInBrowser(url);
  });

program.parse();
