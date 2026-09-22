/**
 * The event stream one research run produces. Every agent, search, thought and
 * verdict becomes an event here; the pipeline emits them, the JSONL sink stores
 * them, and the visualizer replays them — live or recorded — from the same shape.
 */

export type StageId =
  | 'brief'
  | 'research'
  | 'assembly'
  | 'followup'
  | 'assembly-2'
  | 'factcheck'
  | 'report';

/** Left-to-right order of the pipeline map. */
export const STAGE_ORDER: readonly StageId[] = [
  'brief',
  'research',
  'assembly',
  'followup',
  'assembly-2',
  'factcheck',
  'report',
];

export const STAGE_LABELS: Record<StageId, string> = {
  brief: 'Brief',
  research: 'Research',
  assembly: 'Assembly',
  followup: 'Follow-up',
  'assembly-2': 'Assembly, second pass',
  factcheck: 'Fact-check',
  report: 'Report',
};

export interface AgentDescriptor {
  id: string;
  stage: StageId;
  /** Short name shown on the map, e.g. "Competitors". */
  label: string;
  /** One sentence, in plain words, of what this agent is doing. */
  task: string;
  /** Agents whose output this one waits for; drawn as edges on the map. */
  dependsOn: string[];
}

export interface SourceRef {
  title: string;
  url: string;
}

export interface Finding {
  claim: string;
  evidence: string;
  sources: SourceRef[];
  confidence: 'high' | 'medium' | 'low';
}

export interface Contradiction {
  topic: string;
  first: { agent: string; claim: string };
  second: { agent: string; claim: string };
}

export interface Gap {
  question: string;
  why: string;
}

export interface Claim {
  id: string;
  text: string;
}

export type Verdict = 'supported' | 'unsupported' | 'contradicted';

export interface ClaimVerdict {
  id: string;
  verdict: Verdict;
  evidence: string;
  source_url: string | null;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  turns: number;
}

export type RunEventBody =
  | { type: 'run.started'; runId: string; brief: string; model: string; startedAt: string }
  | { type: 'run.completed'; durationMs: number; costUsd: number }
  | { type: 'run.failed'; error: string }
  /** Re-emitting for an existing id updates the descriptor (used to rewire edges). */
  | { type: 'agent.queued'; agent: AgentDescriptor }
  | { type: 'agent.started'; agentId: string }
  | { type: 'agent.thinking'; agentId: string; text: string }
  | { type: 'agent.text'; agentId: string; text: string }
  | { type: 'agent.search'; agentId: string; query: string }
  | { type: 'agent.search.results'; agentId: string; query: string; results: SourceRef[] }
  | { type: 'agent.fetch'; agentId: string; url: string }
  | { type: 'agent.completed'; agentId: string; durationMs: number; usage: AgentUsage }
  | { type: 'agent.failed'; agentId: string; error: string }
  | { type: 'findings'; agentId: string; headline: string; findings: Finding[] }
  | { type: 'assembly.result'; summary: string; contradictions: Contradiction[]; gaps: Gap[] }
  | { type: 'followup.answer'; agentId: string; question: string; answer: string; findings: Finding[] }
  | { type: 'report.draft'; markdown: string; claims: Claim[] }
  | { type: 'factcheck.verdicts'; verdicts: ClaimVerdict[] }
  | { type: 'report.final'; markdown: string; supported: number; unsupported: number; contradicted: number };

export type RunEvent = RunEventBody & {
  /** Position in the run's stream; the SSE id and the replay cursor. */
  seq: number;
  /** Milliseconds since the run started; drives replay pacing and the trace clock. */
  t: number;
};

export type RunEventSink = (event: RunEvent) => void;

export class RunBus {
  readonly events: RunEvent[] = [];
  private readonly listeners = new Set<RunEventSink>();
  private finished = false;

  constructor(
    readonly runId: string,
    private readonly startedAt: number = Date.now(),
    private readonly sink?: RunEventSink,
  ) {}

  emit(body: RunEventBody): RunEvent {
    const event = { ...body, seq: this.events.length, t: Date.now() - this.startedAt } as RunEvent;
    this.push(event);
    return event;
  }

  /** Replay path: the event already carries its seq and t. */
  push(event: RunEvent): void {
    this.events.push(event);
    if (event.type === 'run.completed' || event.type === 'run.failed') this.finished = true;
    this.sink?.(event);
    for (const listener of this.listeners) listener(event);
  }

  get isFinished(): boolean {
    return this.finished;
  }

  subscribe(listener: RunEventSink): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
