/**
 * A scripted run for previewing the visualizer without spending a token. It is
 * openly a sample: the brief says so and every fact in it is made up.
 */

import type { RunEvent, RunEventBody } from './events.js';

const SAMPLE_BRIEF =
  'Sample run (made-up data). We are a magnesium brand that primarily operates in the UK/EU market. Our retention after order 1 has been declining and we want to know why?';

const REPORT = `## What is happening

Second-order retention slipped from roughly 46% to 39% over two quarters while first-order volume held steady [c1]. The drop is concentrated in customers acquired through paid social [c2].

## Most likely causes, ranked

1. **Expectation gap on onset.** Buyers expect sleep or cramp relief inside two weeks; glycinate and citrate typically need four to six [c3]. Competitors have started saying this on the pack and in the welcome email.
2. **Price pressure from own-label.** Two grocers launched 90-tablet magnesium lines at under half the brand's per-dose price [c4].
3. **Subscription fatigue.** Cancellation within the first cycle across UK supplement subscriptions rose year on year [c5].

## Positioning

Move from "the premium magnesium" to "the one that tells you what to expect". Ownership of the onboarding conversation is where the competitor set is weakest.

## What to test next

- A day-10 "here is why you don't feel it yet" message.
- A smaller, cheaper first pack that lands before the second order decision.

## What we could not verify

Whether the decline is worse on citrate than glycinate; nobody publishes this.`;

const CLAIMS = [
  { id: 'c1', text: 'Second-order retention slipped from roughly 46% to 39% over two quarters while first-order volume held steady.' },
  { id: 'c2', text: 'The drop is concentrated in customers acquired through paid social.' },
  { id: 'c3', text: 'Glycinate and citrate typically need four to six weeks for a noticeable effect.' },
  { id: 'c4', text: 'Two grocers launched 90-tablet magnesium lines at under half the brand\'s per-dose price.' },
  { id: 'c5', text: 'Cancellation within the first cycle across UK supplement subscriptions rose year on year.' },
];

export function buildSampleRun(runId: string): RunEvent[] {
  const events: RunEvent[] = [];
  const at = (t: number, body: RunEventBody) => events.push({ ...body, seq: events.length, t } as RunEvent);
  const usage = (costUsd: number, turns: number) => ({ inputTokens: 42_000, outputTokens: 3_200, costUsd, turns });
  const src = (title: string, url: string) => ({ title, url });
  const finding = (claim: string, evidence: string, confidence: 'high' | 'medium' | 'low', ...sources: { title: string; url: string }[]) => ({
    claim,
    evidence,
    confidence,
    sources,
  });

  at(0, { type: 'run.started', runId, brief: SAMPLE_BRIEF, model: 'sample', startedAt: new Date().toISOString() });
  at(0, { type: 'agent.queued', agent: { id: 'brief', stage: 'brief', label: 'Brief', task: 'The question as the brand asked it', dependsOn: [] } });
  at(0, { type: 'agent.started', agentId: 'brief' });
  at(0, { type: 'agent.completed', agentId: 'brief', durationMs: 0, usage: usage(0, 0) });

  const researchers = [
    ['macro', 'Macro', 'Researching the economy, regulation and logistics of the market'],
    ['trends', 'Consumer trends', 'Researching how buyers in this category are behaving'],
    ['competitors', 'Competitors', 'Researching named competitors and what they do to keep customers'],
  ] as const;
  for (const [id, label, task] of researchers) {
    at(100, { type: 'agent.queued', agent: { id, stage: 'research', label, task, dependsOn: ['brief'] } });
  }
  at(100, { type: 'agent.queued', agent: { id: 'assembly', stage: 'assembly', label: 'Assembly', task: 'Reading every finding, looking for contradictions and gaps', dependsOn: ['macro', 'trends', 'competitors'] } });
  at(100, { type: 'agent.queued', agent: { id: 'assembly-2', stage: 'assembly-2', label: 'Assembly', task: 'Re-reading with the follow-up answers and writing the report', dependsOn: ['assembly'] } });
  at(100, { type: 'agent.queued', agent: { id: 'factcheck', stage: 'factcheck', label: 'Fact-check', task: 'Tracing every claim in the report back to a source', dependsOn: ['assembly-2'] } });
  at(100, { type: 'agent.queued', agent: { id: 'report', stage: 'report', label: 'Report', task: 'The finished report with each claim marked by its verdict', dependsOn: ['factcheck'] } });

  for (const [id] of researchers) at(400, { type: 'agent.started', agentId: id });

  at(1_800, { type: 'agent.thinking', agentId: 'macro', text: 'The brief names the UK and EU, so US data is out. I want consumer confidence, VAT treatment of supplements, and the 2025 labelling changes first.' });
  at(2_600, { type: 'agent.text', agentId: 'macro', text: 'Starting with the regulatory side, since a labelling change could explain a retention drop on its own.' });
  at(3_000, { type: 'agent.search', agentId: 'macro', query: 'UK food supplement labelling rules 2025 health claims magnesium' });
  at(2_200, { type: 'agent.thinking', agentId: 'trends', text: 'Retention after the first order is a behaviour question. Reviews and forums will say more than market-size reports.' });
  at(3_400, { type: 'agent.search', agentId: 'trends', query: 'magnesium glycinate "didn\'t work" reviews how long to feel effect' });
  at(2_900, { type: 'agent.thinking', agentId: 'competitors', text: 'Need the named set: who sells magnesium on subscription in the UK, at what price, and what happens after order one.' });
  at(3_900, { type: 'agent.search', agentId: 'competitors', query: 'best magnesium supplement UK subscription 2026' });

  at(6_500, { type: 'agent.search.results', agentId: 'macro', query: 'UK food supplement labelling rules 2025 health claims magnesium', results: [src('Nutrition and health claims: guidance', 'https://example.gov.uk/claims'), src('Food supplements, UK rules', 'https://example.gov.uk/supplements')] });
  at(7_100, { type: 'agent.search.results', agentId: 'trends', query: 'magnesium glycinate "didn\'t work" reviews how long to feel effect', results: [src('How long does magnesium take to work?', 'https://example.org/onset'), src('r/Supplements: magnesium doing nothing?', 'https://example.social/thread')] });
  at(7_600, { type: 'agent.search.results', agentId: 'competitors', query: 'best magnesium supplement UK subscription 2026', results: [src('Best magnesium supplements 2026', 'https://example.press/best-magnesium'), src('Grocer launches own-label vitamins', 'https://example.press/own-label')] });

  at(9_000, { type: 'agent.text', agentId: 'macro', text: 'Labelling changed in 2025 but only for on-pack claims, not for anything a customer sees after purchase. Moving on to spending.' });
  at(9_400, { type: 'agent.search', agentId: 'macro', query: 'UK consumer confidence health supplements spending 2026' });
  at(10_200, { type: 'agent.search', agentId: 'trends', query: 'UK supplement subscription cancellation rate first cycle 2025' });
  at(10_900, { type: 'agent.search', agentId: 'competitors', query: 'own label magnesium 90 tablets price per dose UK grocer' });
  at(13_500, { type: 'agent.search.results', agentId: 'macro', query: 'UK consumer confidence health supplements spending 2026', results: [src('Consumer confidence tracker', 'https://example.org/confidence')] });
  at(14_000, { type: 'agent.search.results', agentId: 'trends', query: 'UK supplement subscription cancellation rate first cycle 2025', results: [src('Subscription economy report 2025', 'https://example.org/subs-2025')] });
  at(14_600, { type: 'agent.search.results', agentId: 'competitors', query: 'own label magnesium 90 tablets price per dose UK grocer', results: [src('Own-label vitamins range', 'https://example.shop/own-label'), src('Price comparison: magnesium', 'https://example.press/compare')] });

  at(19_000, { type: 'agent.completed', agentId: 'trends', durationMs: 18_600, usage: usage(0.41, 9) });
  at(19_000, {
    type: 'findings',
    agentId: 'trends',
    headline: 'Buyers expect to feel something in two weeks and most forms take longer.',
    findings: [
      finding('Most buyers expect a noticeable effect within two weeks.', 'Forum and review sampling: "two weeks" is the most common patience window quoted.', 'medium', src('r/Supplements thread', 'https://example.social/thread')),
      finding('Glycinate and citrate typically take four to six weeks to show sleep or cramp benefits.', 'Two clinical summaries cite 4–6 weeks.', 'high', src('How long does magnesium take to work?', 'https://example.org/onset')),
      finding('First-cycle cancellation across UK supplement subscriptions rose from 22% to 27% year on year.', 'Subscription economy report, 2025 edition.', 'medium', src('Subscription economy report 2025', 'https://example.org/subs-2025')),
    ],
  });
  at(21_500, { type: 'agent.completed', agentId: 'macro', durationMs: 21_100, usage: usage(0.38, 8) });
  at(21_500, {
    type: 'findings',
    agentId: 'macro',
    headline: 'Nothing structural changed; the pressure is price, not policy.',
    findings: [
      finding('The 2025 labelling changes affect on-pack claims only.', 'Guidance scope is limited to point-of-sale claims.', 'high', src('Nutrition and health claims: guidance', 'https://example.gov.uk/claims')),
      finding('UK consumer confidence in discretionary health spend fell for three consecutive quarters.', 'Tracker index down 6 points.', 'medium', src('Consumer confidence tracker', 'https://example.org/confidence')),
    ],
  });
  at(23_800, { type: 'agent.completed', agentId: 'competitors', durationMs: 23_400, usage: usage(0.47, 10) });
  at(23_800, {
    type: 'findings',
    agentId: 'competitors',
    headline: 'Own-label undercut the category and the leaders answered with onboarding, not price.',
    findings: [
      finding('Two grocers launched 90-tablet magnesium lines at under half the brand\'s per-dose price.', 'Listed at £4.50 and £5.00 for 90 tablets.', 'high', src('Own-label vitamins range', 'https://example.shop/own-label'), src('Price comparison: magnesium', 'https://example.press/compare')),
      finding('The two largest subscription competitors send a day-10 "what to expect" email.', 'Observed in signup flows.', 'medium', src('Best magnesium supplements 2026', 'https://example.press/best-magnesium')),
    ],
  });

  at(24_200, { type: 'agent.started', agentId: 'assembly' });
  at(26_000, { type: 'agent.thinking', agentId: 'assembly', text: 'Three angles agree the cause is expectation and price rather than regulation. Trends and competitors both point at the day-10 moment. Nobody has anything on which channel the churners came from, or whether the drop differs by form.' });
  at(30_500, { type: 'agent.completed', agentId: 'assembly', durationMs: 6_300, usage: usage(0.22, 1) });
  at(30_500, {
    type: 'assembly.result',
    summary: 'The decline looks like an expectation gap meeting a cheaper alternative: buyers give up before the product can work, and own-label makes leaving cheap. Regulation is a non-factor.',
    contradictions: [
      { topic: 'Cause of the drop', first: { agent: 'macro', claim: 'Confidence in discretionary health spend fell' }, second: { agent: 'trends', claim: 'Cancellation rose across the category regardless of price' } },
    ],
    gaps: [
      { question: 'Is the retention drop concentrated in customers acquired through paid social?', why: 'If yes, the fix is targeting and expectation-setting in ads, not the product.' },
      { question: 'Does second-order retention differ between magnesium glycinate and citrate buyers in the UK?', why: 'Onset differs by form; if churn tracks form, the day-10 message should too.' },
    ],
  });
  at(30_600, { type: 'agent.queued', agent: { id: 'followup-1', stage: 'followup', label: 'Follow-up 1', task: 'Is the retention drop concentrated in customers acquired through paid social?', dependsOn: ['assembly'] } });
  at(30_600, { type: 'agent.queued', agent: { id: 'followup-2', stage: 'followup', label: 'Follow-up 2', task: 'Does second-order retention differ between glycinate and citrate buyers?', dependsOn: ['assembly'] } });
  at(30_600, { type: 'agent.queued', agent: { id: 'assembly-2', stage: 'assembly-2', label: 'Assembly', task: 'Re-reading with the follow-up answers and writing the report', dependsOn: ['followup-1', 'followup-2'] } });
  at(31_000, { type: 'agent.started', agentId: 'followup-1' });
  at(31_000, { type: 'agent.started', agentId: 'followup-2' });
  at(32_500, { type: 'agent.search', agentId: 'followup-1', query: 'paid social acquired subscribers retention vs organic supplements' });
  at(33_000, { type: 'agent.search', agentId: 'followup-2', query: 'magnesium glycinate vs citrate repeat purchase rate' });
  at(36_500, { type: 'agent.search.results', agentId: 'followup-1', query: 'paid social acquired subscribers retention vs organic supplements', results: [src('Channel quality benchmarks', 'https://example.org/channels')] });
  at(37_000, { type: 'agent.search.results', agentId: 'followup-2', query: 'magnesium glycinate vs citrate repeat purchase rate', results: [] });
  at(41_000, { type: 'agent.completed', agentId: 'followup-1', durationMs: 10_000, usage: usage(0.19, 5) });
  at(41_000, { type: 'followup.answer', agentId: 'followup-1', question: 'Is the retention drop concentrated in customers acquired through paid social?', answer: 'Category benchmarks put paid-social subscribers at roughly 12 points lower second-order retention than organic; the brand\'s own data would confirm it.', findings: [finding('Paid-social acquired subscribers retain about 12 points worse at order two than organic.', 'Benchmark across 40 DTC supplement brands.', 'medium', src('Channel quality benchmarks', 'https://example.org/channels'))] });
  at(42_500, { type: 'agent.completed', agentId: 'followup-2', durationMs: 11_500, usage: usage(0.17, 5) });
  at(42_500, { type: 'followup.answer', agentId: 'followup-2', question: 'Does second-order retention differ between glycinate and citrate buyers?', answer: 'No public source breaks retention down by form. This stays unverified.', findings: [] });

  at(43_000, { type: 'agent.started', agentId: 'assembly-2' });
  at(45_000, { type: 'agent.thinking', agentId: 'assembly-2', text: 'Ranking: expectation gap first because two angles support it and the fix is cheap; own-label second; category fatigue third. The form question stays in "could not verify".' });
  at(52_000, { type: 'agent.completed', agentId: 'assembly-2', durationMs: 9_000, usage: usage(0.31, 1) });
  at(52_000, { type: 'report.draft', markdown: REPORT, claims: CLAIMS });

  at(52_400, { type: 'agent.started', agentId: 'factcheck' });
  at(54_000, { type: 'agent.thinking', agentId: 'factcheck', text: 'c1 gives a 46% to 39% figure. Nothing in the corpus has the brand\'s own numbers; that came from the brief at best. Unsupported.' });
  at(58_000, { type: 'agent.completed', agentId: 'factcheck', durationMs: 5_600, usage: usage(0.14, 1) });
  at(58_000, {
    type: 'factcheck.verdicts',
    verdicts: [
      { id: 'c1', verdict: 'unsupported', evidence: 'The corpus has no first-party retention figures; the brief only says retention is declining.', source_url: null },
      { id: 'c2', verdict: 'supported', evidence: 'Follow-up 1: paid-social subscribers retain ~12 points worse at order two.', source_url: 'https://example.org/channels' },
      { id: 'c3', verdict: 'supported', evidence: 'Trends: glycinate and citrate typically take four to six weeks.', source_url: 'https://example.org/onset' },
      { id: 'c4', verdict: 'supported', evidence: 'Competitors: two grocers at £4.50 and £5.00 for 90 tablets.', source_url: 'https://example.shop/own-label' },
      { id: 'c5', verdict: 'supported', evidence: 'Trends: first-cycle cancellation rose from 22% to 27%.', source_url: 'https://example.org/subs-2025' },
    ],
  });
  at(58_200, { type: 'agent.started', agentId: 'report' });
  at(58_200, { type: 'agent.completed', agentId: 'report', durationMs: 0, usage: usage(0, 0) });
  at(58_200, { type: 'report.final', markdown: REPORT, supported: 4, unsupported: 1, contradicted: 0 });
  at(58_300, { type: 'run.completed', durationMs: 58_300, costUsd: 2.29 });
  return events;
}
