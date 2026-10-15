import { z } from 'zod';

// Runtime schemas and inferred browser types share one definition. Additional API
// fields are tolerated, while required fields and values are checked before use.
const criterion = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number(),
  description: z.string(),
});
const paragraph = z.object({ id: z.string(), text: z.string() });
const citation = z.object({ paragraphId: z.string(), quote: z.string() });
const evidenceCitation = citation.extend({ explanation: z.string().nullish() });
const finding = z.object({
  criterionId: z.string(),
  status: z.enum(['documented', 'partial', 'missing']),
  finding: z.string(),
  evidence: z.array(evidenceCitation),
  question: z.string().nullable(),
});
const revision = z.number().int().positive();
const review = z.object({
  id: z.string(),
  submissionRevision: revision,
  rubricVersion: revision,
  source: z.enum(['example', 'openai']),
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
  content: z.object({
    summary: z.string(),
    criteria: z.array(finding),
    flags: z.array(
      z.object({
        kind: z.string(),
        paragraphId: z.string(),
        quote: z.string(),
        message: z.string(),
      }),
    ),
  }),
});
const entry = z.object({
  id: z.string(),
  team: z.string(),
  title: z.string(),
  revision,
  status: z.enum(['unreviewed', 'draft', 'reviewed']),
  updatedAt: z.string(),
});
export const outcomeSchema = z.enum(['', 'advance', 'clarify', 'decline']);
const assessment = z.object({
  version: revision,
  submissionRevision: revision,
  rubricVersion: revision,
  reviewId: z.string().nullable(),
  scores: z.record(z.string(), z.number().int().min(0).max(4).nullable()),
  rationale: z.string(),
  outcome: outcomeSchema,
  confirmed: z.boolean(),
  finalized: z.boolean(),
  total: z.number().min(0).max(100).nullable(),
  updatedAt: z.string(),
});
export const detailSchema = z
  .object({
    entry,
    submission: z.object({
      entryId: z.string(),
      revision,
      title: z.string(),
      paragraphs: z.array(paragraph),
      createdAt: z.string(),
    }),
    review: review.nullable(),
    assessment: assessment.nullable(),
    events: z.array(
      z.object({
        id: z.number().int(),
        revision,
        kind: z.string(),
        message: z.string(),
        createdAt: z.string(),
      }),
    ),
  })
  .refine(
    (value) =>
      value.submission.entryId === value.entry.id &&
      value.submission.revision === value.entry.revision &&
      (!value.review || value.review.submissionRevision === value.entry.revision) &&
      (!value.assessment || value.assessment.submissionRevision === value.entry.revision),
    'The response must describe one submission version.',
  );
export const workspaceSchema = z.object({
  sharedDemo: z.boolean().optional(),
  competition: z.object({
    id: z.string(),
    name: z.string(),
    round: z.string(),
    version: revision,
    brief: z.string(),
    criteria: z.array(criterion).min(1),
  }),
  entries: z.array(entry),
  ai: z.object({ available: z.boolean(), remaining: z.number().int().nonnegative() }),
});

export type Criterion = z.infer<typeof criterion>;
export type Paragraph = z.infer<typeof paragraph>;
export type Citation = z.infer<typeof citation>;
export type EvidenceCitation = z.infer<typeof evidenceCitation>;
export type Finding = z.infer<typeof finding>;
export type Review = z.infer<typeof review>;
export type Entry = z.infer<typeof entry>;
export type Assessment = z.infer<typeof assessment>;
export type Detail = z.infer<typeof detailSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
