/**
 * What each agent must hand back. The zod schemas validate the SDK's
 * structured output; their JSON-schema form is what the SDK is asked to produce.
 */

import { z } from 'zod';

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export const FindingSchema = z.object({
  claim: z.string().describe('One specific, checkable statement'),
  evidence: z.string().describe('The numbers, quotes or facts behind the claim'),
  sources: z.array(SourceSchema).describe('Pages actually read; at least one'),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const ResearchOutputSchema = z.object({
  headline: z.string().describe('The one-sentence takeaway for this angle'),
  findings: z.array(FindingSchema).describe('Five to eight findings'),
});

export const AssemblyOutputSchema = z.object({
  summary: z.string().describe('What the combined findings say about the brief, in a paragraph'),
  contradictions: z.array(
    z.object({
      topic: z.string(),
      first: z.object({ agent: z.string(), claim: z.string() }),
      second: z.object({ agent: z.string(), claim: z.string() }),
    }),
  ),
  gaps: z.array(
    z.object({
      question: z.string().describe('A specific, searchable question'),
      why: z.string().describe('Why the answer would change the conclusion'),
    }),
  ),
});

export const FollowupOutputSchema = z.object({
  answer: z.string().describe('The direct answer to the question, with the caveats that matter'),
  findings: z.array(FindingSchema),
});

export const ReportOutputSchema = z.object({
  report_markdown: z.string(),
  claims: z.array(z.object({ id: z.string(), text: z.string() })),
});

export const FactcheckOutputSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['supported', 'unsupported', 'contradicted']),
      evidence: z.string(),
      source_url: z.string().nullable(),
    }),
  ),
});

export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
export type AssemblyOutput = z.infer<typeof AssemblyOutputSchema>;
export type FollowupOutput = z.infer<typeof FollowupOutputSchema>;
export type ReportOutput = z.infer<typeof ReportOutputSchema>;
export type FactcheckOutput = z.infer<typeof FactcheckOutputSchema>;

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}
