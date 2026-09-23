/**
 * Where runs live on disk: data/research/<runId>/events.jsonl (+ report.md).
 * data/ is gitignored and excluded from tsc, so recorded demo runs never ship.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunEvent, RunEventSink } from './events.js';

const here = dirname(fileURLToPath(import.meta.url));
export const RESEARCH_DATA_DIR = join(here, '..', 'data', 'research');
/** Finished runs worth keeping: committed, and bundled into the static site by `export`. */
export const RECORDED_DIR = join(here, '..', 'recorded');

export interface RunSummary {
  runId: string;
  brief: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
  costUsd: number | null;
}

export function runDir(runId: string): string {
  return join(RESEARCH_DATA_DIR, runId);
}

export function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  const salt = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${salt}`;
}

export function createRunSink(runId: string): RunEventSink {
  const dir = runDir(runId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'events.jsonl');
  return (event) => appendFileSync(file, JSON.stringify(event) + '\n');
}

export function readRunEvents(runId: string): RunEvent[] {
  const file = join(runDir(runId), 'events.jsonl');
  if (!existsSync(file)) return [];
  return parseEventLines(readFileSync(file, 'utf8'));
}

export function readRecordedEvents(runId: string): RunEvent[] {
  const file = join(RECORDED_DIR, runId, 'events.jsonl');
  if (!existsSync(file)) return [];
  return parseEventLines(readFileSync(file, 'utf8'));
}

export function listRecordedRuns(): RunSummary[] {
  if (!existsSync(RECORDED_DIR)) return [];
  return readdirSync(RECORDED_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => summariseEvents(entry.name, readRecordedEvents(entry.name)))
    .filter((summary): summary is RunSummary => summary !== null && summary.status === 'completed')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function parseEventLines(text: string): RunEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunEvent);
}

export function summariseEvents(runId: string, events: RunEvent[]): RunSummary | null {
  const started = events.find((e) => e.type === 'run.started');
  if (!started || started.type !== 'run.started') return null;
  const last = events[events.length - 1];
  const status =
    last?.type === 'run.completed' ? 'completed' : last?.type === 'run.failed' ? 'failed' : 'running';
  const costUsd = last?.type === 'run.completed' ? last.costUsd : null;
  return { runId, brief: started.brief, startedAt: started.startedAt, status, costUsd };
}

export function listStoredRuns(): RunSummary[] {
  if (!existsSync(RESEARCH_DATA_DIR)) return [];
  return readdirSync(RESEARCH_DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => summariseEvents(entry.name, readRunEvents(entry.name)))
    .filter((summary): summary is RunSummary => summary !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function writeReportFile(runId: string, markdown: string): string {
  const dir = runDir(runId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'report.md');
  writeFileSync(file, markdown);
  return file;
}
