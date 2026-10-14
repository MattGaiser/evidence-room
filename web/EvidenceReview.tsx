import { useEffect, useRef, useState } from 'react';
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
}) {
  const review = detail.review;
  const [page, setPage] = useState(0);
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
  }, [review?.id]);
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
            Evidence review
          </h3>
        </div>
        <span className="version-chip">Rubric v{rubricVersion}</span>
      </div>
      {review ? (
        <>
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
                  {index + 1}. {item.name}
                </option>
              ))}
            </select>
          </label>
          {finding && (
            <section className="finding" id="criterion-panel" aria-labelledby="criterion-title">
              <div className="finding-heading">
                <h4 id="criterion-title" tabIndex={-1} ref={criterionHeading}>
                  {criterion.name}
                </h4>
                <CoverageBadge status={finding.status} />
              </div>
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
            </section>
          )}
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
              {page === criteria.length - 1 ? 'Continue to your assessment' : 'Next criterion'}
              <ArrowRight size={16} />
            </button>
          </nav>
          {review.content.flags.length > 0 && (
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
        </>
      ) : (
        <div className="empty-analysis">
          <Search size={32} />
          <h4>No analysis for this version yet.</h4>
          <p>
            Run an AI analysis to map the submission to the rubric. You can also read the original
            and score it manually.
          </p>
        </div>
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
        {!review && (
          <button type="button" className="button primary full" onClick={onContinue}>
            Continue to your assessment
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
