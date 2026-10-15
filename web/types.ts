export type Criterion = { id: string; name: string; weight: number; description: string };
export type Paragraph = { id: string; text: string };
export type Citation = { paragraphId: string; quote: string };
export type EvidenceCitation = Citation & { explanation?: string | null };
export type Finding = {
  criterionId: string;
  status: 'documented' | 'partial' | 'missing';
  finding: string;
  evidence: EvidenceCitation[];
  question: string | null;
};
export type Review = {
  id: string;
  submissionRevision: number;
  rubricVersion: number;
  source: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  content: {
    summary: string;
    criteria: Finding[];
    flags: { kind: string; paragraphId: string; quote: string; message: string }[];
  };
};
export type Entry = {
  id: string;
  team: string;
  title: string;
  revision: number;
  status: string;
  updatedAt: string;
};
export type Assessment = {
  version: number;
  submissionRevision: number;
  rubricVersion: number;
  reviewId: string | null;
  scores: Record<string, number | null>;
  rationale: string;
  outcome: string;
  confirmed: boolean;
  finalized: boolean;
  total: number | null;
  updatedAt: string;
};
export type Detail = {
  entry: Entry;
  submission: { revision: number; title: string; paragraphs: Paragraph[]; createdAt: string };
  review: Review | null;
  assessment: Assessment | null;
  events: { id: number; revision: number; kind: string; message: string; createdAt: string }[];
};
export type Workspace = {
  sharedDemo?: boolean;
  competition: {
    id: string;
    name: string;
    round: string;
    version: number;
    brief: string;
    criteria: Criterion[];
  };
  entries: Entry[];
  ai: { available: boolean; remaining: number };
};
