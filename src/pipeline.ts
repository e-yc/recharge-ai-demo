/**
 * The research crew, in order: three analysts in parallel, assembly, one round of
 * follow-ups on the gaps assembly named, a second assembly pass that writes the
 * report, and a fact-checker that never saw the drafting. Positioning is a report
 * section rather than a stage because it is a conclusion drawn from the other three.
 */

import { mkdirSync } from 'node:fs';
import type { AgentDescriptor, Finding, Gap, RunBus } from './events.js';
import { runAgentTurn } from './agent-turn.js';
import {
  ASSEMBLY_SYSTEM_PROMPT,
  FACTCHECK_SYSTEM_PROMPT,
  FOLLOWUP_SEARCH_BUDGET,
  RESEARCH_SEARCH_BUDGET,
  REPORT_SYSTEM_PROMPT,
  RESEARCH_ANGLES,
  assemblyUserPrompt,
  factcheckUserPrompt,
  followupSystemPrompt,
  followupUserPrompt,
  reportUserPrompt,
  researchSystemPrompt,
  researchUserPrompt,
} from './prompts.js';
import { runDir, writeReportFile } from './run-store.js';
import {
  AssemblyOutputSchema,
  FactcheckOutputSchema,
  FollowupOutputSchema,
  ReportOutputSchema,
  ResearchOutputSchema,
} from './schemas.js';

export interface PipelineOptions {
  brief: string;
  model: string;
  /** One round only, capped, so the loop can't run away on stage. */
  maxFollowups: number;
  signal?: AbortSignal;
}

export interface PipelineResult {
  reportMarkdown: string;
  reportPath: string;
  costUsd: number;
}

const WEB_TOOLS = ['WebSearch', 'WebFetch'];

interface FollowupRecord {
  question: string;
  answer: string;
  findings: Finding[];
}

export async function runResearchPipeline(bus: RunBus, opts: PipelineOptions): Promise<PipelineResult> {
  const startedAt = Date.now();
  const cwd = runDir(bus.runId);
  mkdirSync(cwd, { recursive: true });
  let costUsd = 0;
  const trackCost = bus.subscribe((e) => {
    if (e.type === 'agent.completed') costUsd += e.usage.costUsd;
  });

  const queue = (agent: AgentDescriptor) => bus.emit({ type: 'agent.queued', agent });
  const passthrough = (agent: AgentDescriptor) => {
    queue(agent);
    bus.emit({ type: 'agent.started', agentId: agent.id });
    bus.emit({
      type: 'agent.completed',
      agentId: agent.id,
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 0 },
    });
  };

  try {
    bus.emit({
      type: 'run.started',
      runId: bus.runId,
      brief: opts.brief,
      model: opts.model,
      startedAt: new Date(startedAt).toISOString(),
    });
    passthrough({ id: 'brief', stage: 'brief', label: 'Brief', task: 'The question as the brand asked it', dependsOn: [] });

    // Queue the fixed shape up front so the room sees the whole map before anyone runs.
    const researchers: AgentDescriptor[] = RESEARCH_ANGLES.map((angle) => ({
      id: angle.id,
      stage: 'research',
      label: angle.label,
      task: angle.task,
      dependsOn: ['brief'],
    }));
    const assembly: AgentDescriptor = {
      id: 'assembly',
      stage: 'assembly',
      label: 'Assembly',
      task: 'Reading every finding, looking for contradictions and gaps',
      dependsOn: researchers.map((r) => r.id),
    };
    const assembly2: AgentDescriptor = {
      id: 'assembly-2',
      stage: 'assembly-2',
      label: 'Assembly',
      task: 'Re-reading with the follow-up answers and writing the report',
      dependsOn: ['assembly'],
    };
    const factcheck: AgentDescriptor = {
      id: 'factcheck',
      stage: 'factcheck',
      label: 'Fact-check',
      task: 'Tracing every claim in the report back to a source',
      dependsOn: ['assembly-2'],
    };
    const report: AgentDescriptor = {
      id: 'report',
      stage: 'report',
      label: 'Report',
      task: 'The finished report with each claim marked by its verdict',
      dependsOn: ['factcheck'],
    };
    for (const agent of [...researchers, assembly, assembly2, factcheck, report]) queue(agent);

    // Research: three angles at once. One failure shouldn't sink the demo, so the
    // survivors carry on as long as somebody found something.
    const researchResults = await Promise.allSettled(
      researchers.map((agent, i) =>
        runAgentTurn(bus, {
          agent,
          model: opts.model,
          system: researchSystemPrompt(RESEARCH_ANGLES[i]),
          prompt: researchUserPrompt(opts.brief),
          schema: ResearchOutputSchema,
          tools: WEB_TOOLS,
          maxTurns: RESEARCH_SEARCH_BUDGET * 2 + 8,
          effort: 'medium',
          cwd,
          signal: opts.signal,
        }),
      ),
    );
    const findingsByAgent: Record<string, Finding[]> = {};
    researchResults.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const agent = researchers[i];
      findingsByAgent[agent.label.toLowerCase()] = result.value.findings;
      bus.emit({ type: 'findings', agentId: agent.id, headline: result.value.headline, findings: result.value.findings });
    });
    if (Object.keys(findingsByAgent).length === 0) throw new Error('every research agent failed');

    // Assembly, first pass: what does it add up to, and what don't we know?
    const assembled = await runAgentTurn(bus, {
      agent: assembly,
      model: opts.model,
      system: ASSEMBLY_SYSTEM_PROMPT,
      prompt: assemblyUserPrompt(opts.brief, findingsByAgent),
      schema: AssemblyOutputSchema,
      tools: [],
      maxTurns: 4,
      effort: 'high',
      cwd,
      signal: opts.signal,
    });
    bus.emit({ type: 'assembly.result', ...assembled });

    // Follow-up: one targeted agent per gap, one round.
    const gaps: Gap[] = assembled.gaps.slice(0, opts.maxFollowups);
    const followupAgents: AgentDescriptor[] = gaps.map((gap, i) => ({
      id: `followup-${i + 1}`,
      stage: 'followup',
      label: `Follow-up ${i + 1}`,
      task: gap.question,
      dependsOn: ['assembly'],
    }));
    for (const agent of followupAgents) queue(agent);
    if (followupAgents.length > 0) queue({ ...assembly2, dependsOn: followupAgents.map((a) => a.id) });

    const followupResults = await Promise.allSettled(
      followupAgents.map((agent, i) =>
        runAgentTurn(bus, {
          agent,
          model: opts.model,
          system: followupSystemPrompt(),
          prompt: followupUserPrompt(opts.brief, gaps[i]),
          schema: FollowupOutputSchema,
          tools: WEB_TOOLS,
          // Backstop only: the prompt's search budget is what makes the agent wrap up. A cap near
          // the budget cut a follow-up off mid-search in run 2 and discarded everything it had found.
          maxTurns: FOLLOWUP_SEARCH_BUDGET * 2 + 6,
          effort: 'medium',
          cwd,
          signal: opts.signal,
        }),
      ),
    );
    const followups: FollowupRecord[] = [];
    followupResults.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const record = { question: gaps[i].question, answer: result.value.answer, findings: result.value.findings };
      followups.push(record);
      bus.emit({ type: 'followup.answer', agentId: followupAgents[i].id, ...record });
    });

    // Assembly, second pass: write the report with the answers in hand.
    const drafted = await runAgentTurn(bus, {
      agent: assembly2,
      model: opts.model,
      system: REPORT_SYSTEM_PROMPT,
      prompt: reportUserPrompt(opts.brief, assembled.summary, assembled.contradictions, findingsByAgent, followups),
      schema: ReportOutputSchema,
      tools: [],
      maxTurns: 4,
      effort: 'high',
      cwd,
      signal: opts.signal,
    });
    bus.emit({ type: 'report.draft', markdown: drafted.report_markdown, claims: drafted.claims });

    // Fact-check: a different agent, corpus only, no web.
    const checked = await runAgentTurn(bus, {
      agent: factcheck,
      model: opts.model,
      system: FACTCHECK_SYSTEM_PROMPT,
      prompt: factcheckUserPrompt(drafted.claims, findingsByAgent, followups),
      schema: FactcheckOutputSchema,
      tools: [],
      maxTurns: 4,
      effort: 'high',
      cwd,
      signal: opts.signal,
    });
    bus.emit({ type: 'factcheck.verdicts', verdicts: checked.verdicts });

    const counts = { supported: 0, unsupported: 0, contradicted: 0 };
    for (const v of checked.verdicts) counts[v.verdict] += 1;
    const reportMarkdown = appendVerdictAppendix(drafted.report_markdown, drafted.claims, checked.verdicts);
    const reportPath = writeReportFile(bus.runId, reportMarkdown);

    passthrough(report);
    bus.emit({ type: 'report.final', markdown: drafted.report_markdown, ...counts });
    bus.emit({ type: 'run.completed', durationMs: Date.now() - startedAt, costUsd });
    return { reportMarkdown, reportPath, costUsd };
  } catch (err) {
    bus.emit({ type: 'run.failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    trackCost();
  }
}

function appendVerdictAppendix(
  markdown: string,
  claims: { id: string; text: string }[],
  verdicts: { id: string; verdict: string; evidence: string; source_url: string | null }[],
): string {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const lines = claims.map((c) => {
    const v = byId.get(c.id);
    const source = v?.source_url ? ` (${v.source_url})` : '';
    return `- [${c.id}] ${v?.verdict ?? 'unchecked'}: ${c.text}\n  ${v?.evidence ?? ''}${source}`;
  });
  return `${markdown.trim()}\n\n## Claim check\n\n${lines.join('\n')}\n`;
}
