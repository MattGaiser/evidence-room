import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import CriterionScore from './CriterionScore';
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleHelp,
  CircleAlert,
  LoaderCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { focusPanelHeading } from './focus';
import type { Citation, Criterion, Detail, Finding, Workspace } from './types';
import { formatDate } from './format';

const coverage = {
  documented: { label: 'Evidence described', Icon: CircleCheck },
  partial: { label: 'Needs detail', Icon: CircleAlert },
  missing: { label: 'Not provided', Icon: CircleHelp },
};
function CoverageBadge({ status }: { status: Finding['status'] }) {
  const { label, Icon } = coverage[status];
  return (
    <span className={`coverage ${status}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
export default function EvidenceReview({
  detail,
  criteria,
  rubricVersion,
  ai,
  busy,
  onCitation,
  onCriterionChange,
  onAnalyze,
  onCancel,
  onContinue,
  criterionIndex,
  onCriterionIndex,
  scores,
  onScore,
  scoreDisabled,
  saveControls,
}: {
  detail: Detail;
  criteria: Criterion[];
  rubricVersion: number;
  ai: Workspace['ai'];
  busy: boolean;
  onCitation: (citation: Citation, origin: HTMLButtonElement) => void;
  onCriterionChange: () => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onContinue: () => void;
  criterionIndex: number;
  onCriterionIndex: (index: number) => void;
  scores: Record<string, number | null>;
  onScore: (id: string, value: number) => void;
  scoreDisabled: boolean;
  saveControls: ReactNode;
}) {
  const review = detail.review;
  const page = criterionIndex;
  const setPage = onCriterionIndex;
  const criterion = criteria[page];
  const finding = review?.content.criteria.find((item) => item.criterionId === criterion.id);
  const criterionHeading = useRef<HTMLHeadingElement>(null);
  const focusCriterion = useRef(false);
  const changePage = (next: number) => {
    focusCriterion.current = true;
    onCriterionChange();
    setPage(next);
  };
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    if (!focusCriterion.current) return;
    focusCriterion.current = false;
    const frame = requestAnimationFrame(() => focusPanelHeading(criterionHeading.current));
    return () => cancelAnimationFrame(frame);
  }, [page]);
  const previousReview = useRef(review?.id);
  useEffect(() => {
    if (previousReview.current !== review?.id) {
      previousReview.current = review?.id;
      setPage(0);
    }
  }, [review?.id, setPage]);
  const unavailable = detail.assessment?.finalized
    ? 'Submit a revision to start a new review.'
    : !ai.available
      ? 'AI analysis is off. You can still review and score this submission.'
      : ai.remaining === 0
        ? 'The AI request limit has been reached. You can still score this submission.'
        : null;
  return (
    <section className="panel analysis" aria-labelledby="analysis-title">
      <div className="panel-heading">
        <div>
          <h3 id="analysis-title" tabIndex={-1}>
            Review and score
          </h3>
        </div>
        <span className="version-chip">Rubric v{rubricVersion}</span>
      </div>
      {review && (
        <div className="analysis-summary">
          <span className="analysis-source">
            {review.source === 'example' ? 'Example analysis' : 'AI analysis'}
            <span>Submission v{review.submissionRevision}</span>
          </span>
          <details className="review-overview">
            <summary>Submission summary</summary>
            <p>{review.content.summary}</p>
          </details>
        </div>
      )}
      {!review && (
        <div className="empty-analysis">
          <Search size={28} />
          <h4>No analysis for this version yet.</h4>
          <p>
            Read the source passages and score each criterion below. You can also run an AI analysis
            to find supporting passages and open questions.
          </p>
        </div>
      )}
      <label className="criterion-jump">
        <span>Choose a criterion</span>
        <select
          value={page}
          onChange={(event) => {
            focusCriterion.current = false;
            onCriterionChange();
            setPage(Number(event.target.value));
          }}
          aria-controls="criterion-panel"
        >
          {criteria.map((item, index) => (
            <option key={item.id} value={index}>
              {index + 1}. {item.name}{' '}
              {scores[item.id] === null ? '(not scored)' : `(${scores[item.id]}/4)`}
            </option>
          ))}
        </select>
      </label>
      <section className="finding" id="criterion-panel" aria-labelledby="criterion-title">
        <div className="finding-heading">
          <h4 id="criterion-title" tabIndex={-1} ref={criterionHeading}>
            {criterion.name}
          </h4>
          {finding && <CoverageBadge status={finding.status} />}
        </div>
        {finding && (
          <div className="finding-content">
            <p>{finding.finding}</p>
            {finding.evidence.map((cite) => (
              <button
                type="button"
                className="evidence-quote"
                key={cite.paragraphId + cite.quote}
                onClick={(event) => onCitation(cite, event.currentTarget)}
              >
                <span>“{cite.quote}”</span>
                <small>
                  Passage {cite.paragraphId.slice(1)}
                  <ArrowLeft size={13} />
                </small>
              </button>
            ))}
            {finding.question && (
              <div className="clarification">
                <strong>Ask the team</strong>
                <p>{finding.question}</p>
              </div>
            )}
          </div>
        )}
      </section>
      <CriterionScore
        criterion={criterion}
        score={scores[criterion.id]}
        disabled={scoreDisabled}
        finalized={detail.assessment?.finalized === true}
        onScore={(value) => onScore(criterion.id, value)}
      />
      <div className="criterion-save">
        {saveControls}
        <p className="score-progress" role="status">
          {criteria.filter((item) => scores[item.id] !== null).length} of {criteria.length} criteria
          scored
        </p>
      </div>
      <nav className="criterion-pager" aria-label="Evidence criteria">
        <button
          type="button"
          className="button secondary"
          disabled={page === 0}
          onClick={() => changePage(page - 1)}
        >
          <ArrowLeft size={16} />
          Previous
        </button>
        <span role="status" aria-live="polite">
          {page + 1} of {criteria.length}
        </span>
        <button
          type="button"
          className="button primary"
          onClick={page === criteria.length - 1 ? onContinue : () => changePage(page + 1)}
        >
          {page === criteria.length - 1 ? 'Continue to recommendation' : 'Next criterion'}
          <ArrowRight size={16} />
        </button>
      </nav>
      {review && review.content.flags.length > 0 && (
        <div className="review-flags">
          <h4>Items for attention</h4>
          {review.content.flags.map((flag) => (
            <div key={flag.paragraphId + flag.quote}>
              <p>{flag.message}</p>
              <button
                type="button"
                className="text-button"
                onClick={(event) =>
                  onCitation(
                    {
                      paragraphId: flag.paragraphId,
                      quote: flag.quote,
                    },
                    event.currentTarget,
                  )
                }
              >
                View flagged passage
                <ArrowLeft size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {review && (
        <details className="analysis-provenance">
          <summary>Analysis details</summary>
          <dl>
            <div>
              <dt>Source</dt>
              <dd>{review.source === 'example' ? 'Authored illustration' : review.model}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{review.promptVersion}</dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd>{formatDate(review.createdAt)}</dd>
            </div>
          </dl>
        </details>
      )}
      <div className="analysis-actions">
        {busy ? (
          <>
            <p role="status">
              <LoaderCircle size={16} className="spin" />
              Reading the rubric and checking source passages…
            </p>
            <button type="button" className="button secondary full" onClick={onCancel}>
              Cancel analysis
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button secondary full"
              disabled={!ai.available || ai.remaining === 0 || detail.assessment?.finalized}
              onClick={onAnalyze}
            >
              <Sparkles size={16} />
              {review?.source === 'openai' ? 'Run a new AI analysis' : 'Run AI analysis'}
            </button>
            {unavailable && <p className="field-help">{unavailable}</p>}
          </>
        )}
      </div>
    </section>
  );
}
