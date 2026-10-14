export type Criterion = { id: string; name: string; weight: number; description: string };
export type Paragraph = { id: string; text: string };
export type Citation = { paragraphId: string; quote: string };
export type Finding = {
  criterionId: string;
  status: 'documented' | 'partial' | 'missing';
  finding: string;
  evidence: Citation[];
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof body.error === 'string'
        ? body.error
        : 'The operation could not be completed. Try again.',
    );
  return body as T;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.name === 'TimeoutError'
      ? 'The server took too long to respond. Your text is still here; try again.'
      : error.message
    : 'The operation could not be completed.';
}
export const outcomeLabels: Record<string, string> = {
  advance: 'Recommend a pilot',
  clarify: 'Request clarification',
  decline: 'Do not recommend yet',
};
