/**
 * What each agent is told. Kept short on purpose: the model decides how to
 * research; we only fix the angle, the market default and the output contract.
 */

import type { Contradiction, Finding, Gap } from './events.js';

export interface ResearchAngle {
  id: 'macro' | 'trends' | 'competitors';
  label: string;
  task: string;
  focus: string;
}

export const RESEARCH_ANGLES: readonly ResearchAngle[] = [
  {
    id: 'macro',
    label: 'Macro',
    task: 'Researching the economy, regulation and logistics of the market',
    focus:
      'the macro picture of the market the brand sells into: consumer spending and confidence, inflation and currency, regulation that touches this category (labelling, health claims, import rules), delivery and returns expectations, and anything structural that changed in the last 18 months.',
  },
  {
    id: 'trends',
    label: 'Consumer trends',
    task: 'Researching how buyers in this category are behaving',
    focus:
      'how consumers in this category are behaving: demand and search interest, what they say in reviews and forums, subscription fatigue and cancellation behaviour, ingredient or format trends, the channels they discover and buy through, and what makes them stay or leave after a first order.',
  },
  {
    id: 'competitors',
    label: 'Competitors',
    task: 'Researching named competitors and what they do to keep customers',
    focus:
      'the named competitors: who they are, prices and pack sizes, their subscription offers and discounts, what they do between order one and order two (onboarding, education, reminders, loyalty), and what their customers complain about.',
  },
];

const today = () => new Date().toISOString().slice(0, 10);

const MARKET_RULE =
  'If the brief does not name a market, assume the United States. If it names one, stay inside it and say so when a source is from elsewhere.';

const SOURCE_RULE =
  'Use web search. Every finding needs at least one source you actually read, and the evidence field carries the specifics: numbers, names, dates. Prefer sources from the last two years. When sources disagree, say so rather than picking one. Do not invent numbers.';

/** A budget the agent can see makes it wrap up on its own; the SDK's hard turn cap only discards work. */
function budgetRule(searches: number): string {
  return `You have a budget of about ${searches} searches or page reads in total. Plan for it, and when it is spent, stop researching and write up what you have — an honest answer from ${searches} sources beats no answer at all.`;
}

export function researchSystemPrompt(angle: ResearchAngle): string {
  return `You are one of three analysts researching a brand's question in parallel. Your angle is ${angle.label.toLowerCase()}: ${angle.focus}

Today is ${today()}. ${MARKET_RULE}

${SOURCE_RULE} ${budgetRule(RESEARCH_SEARCH_BUDGET)} Aim for five to eight findings that bear on the brand's actual question, not general background. Say briefly what you are looking for before each search so a reader can follow your reasoning.`;
}

export const RESEARCH_SEARCH_BUDGET = 14;
export const FOLLOWUP_SEARCH_BUDGET = 9;

export function researchUserPrompt(brief: string): string {
  return `The brief, in the brand's words:\n\n${brief}\n\nResearch your angle and return the findings.`;
}

export const ASSEMBLY_SYSTEM_PROMPT = `You read what three analysts found and you do not research. Your job is to see the whole picture and to be honest about its holes.

Write a summary of what the findings, taken together, say about the brand's question. List contradictions: places where two findings disagree or do not square, naming the analyst and the claim on each side. Then list the gaps: up to three specific questions that nobody answered and whose answer would materially change the conclusion. Phrase each as something a researcher could search for, and say why it matters. If there are no real gaps, return none; do not pad.`;

export function assemblyUserPrompt(brief: string, findingsByAgent: Record<string, Finding[]>): string {
  return `The brief:\n\n${brief}\n\n${formatFindings(findingsByAgent)}\n\nProduce the summary, the contradictions and the gaps.`;
}

export function followupSystemPrompt(): string {
  return `You answer one specific question that an earlier research pass left open. Stay on that question; do not widen it.

Today is ${today()}. ${MARKET_RULE}

${SOURCE_RULE} ${budgetRule(FOLLOWUP_SEARCH_BUDGET)} If the answer isn't publicly available, say so plainly — that is a useful answer. Return a direct answer and the findings behind it.`;
}

export function followupUserPrompt(brief: string, gap: Gap): string {
  return `The brand's brief, for context:\n\n${brief}\n\nThe open question: ${gap.question}\n\nWhy it matters: ${gap.why}`;
}

export const REPORT_SYSTEM_PROMPT = `You write the report that answers the brand's question, from the research below and nothing else. You do not research.

Structure it as: what is happening; the most likely causes, ranked, with the evidence for each; what this means for how the brand positions itself; what to test next; what we could not verify. Under about 900 words. Write for a founder, not an analyst: plain sentences, specific numbers, no filler.

Every factual statement that comes from the research carries a marker immediately after it, like [c1], [c2], numbered in order of appearance, and appears once in the claims list with the same id and the sentence it marks. Recommendations and reasoning are not claims and carry no marker. Where the research contradicted itself, say so in the report rather than smoothing it over.`;

export function reportUserPrompt(
  brief: string,
  summary: string,
  contradictions: Contradiction[],
  findingsByAgent: Record<string, Finding[]>,
  followups: { question: string; answer: string; findings: Finding[] }[],
): string {
  const contradictionText = contradictions.length
    ? contradictions
        .map((c) => `- ${c.topic}: ${c.first.agent} says "${c.first.claim}"; ${c.second.agent} says "${c.second.claim}"`)
        .join('\n')
    : '- none found';
  const followupText = followups.length
    ? followups
        .map((f) => `Question: ${f.question}\nAnswer: ${f.answer}\n${formatFindingList(f.findings)}`)
        .join('\n\n')
    : '(no follow-up questions were needed)';
  return `The brief:\n\n${brief}\n\nFirst-pass summary:\n${summary}\n\nContradictions:\n${contradictionText}\n\n${formatFindings(findingsByAgent)}\n\nFollow-up research:\n${followupText}\n\nWrite the report.`;
}

export const FACTCHECK_SYSTEM_PROMPT = `You did not write this report and you did not do the research. You check each marked claim against the research corpus only; you do not search the web.

For each claim: supported if the corpus contains evidence for it, unsupported if the corpus says nothing that backs it, contradicted if the corpus says otherwise. Quote the evidence you relied on and give the source URL when there is one. Be strict: a number the corpus does not contain is unsupported even if it sounds right.`;

export function factcheckUserPrompt(
  claims: { id: string; text: string }[],
  findingsByAgent: Record<string, Finding[]>,
  followups: { question: string; answer: string; findings: Finding[] }[],
): string {
  const claimText = claims.map((c) => `${c.id}: ${c.text}`).join('\n');
  const followupText = followups
    .map((f) => `Question: ${f.question}\nAnswer: ${f.answer}\n${formatFindingList(f.findings)}`)
    .join('\n\n');
  return `Claims to check:\n${claimText}\n\nResearch corpus:\n\n${formatFindings(findingsByAgent)}\n\nFollow-up research:\n${followupText || '(none)'}\n\nReturn a verdict for every claim.`;
}

function formatFindings(findingsByAgent: Record<string, Finding[]>): string {
  return Object.entries(findingsByAgent)
    .map(([agent, findings]) => `Findings from the ${agent} analyst:\n${formatFindingList(findings)}`)
    .join('\n\n');
}

function formatFindingList(findings: Finding[]): string {
  if (findings.length === 0) return '- (none)';
  return findings
    .map((f, i) => {
      const sources = f.sources.map((s) => `${s.title} <${s.url}>`).join('; ');
      return `${i + 1}. ${f.claim}\n   Evidence: ${f.evidence}\n   Confidence: ${f.confidence}. Sources: ${sources || 'none given'}`;
    })
    .join('\n');
}
