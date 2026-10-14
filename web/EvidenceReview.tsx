import { ArrowLeft, ArrowRight, ChevronDown, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { Citation, Criterion, Detail, Workspace } from './types';
import { formatDate } from './format';

const coverage = {
  documented: 'Evidence described',
  partial: 'Needs detail',
  missing: 'Not provided',
};
export default function EvidenceReview({
  detail,
  criteria,
  rubricVersion,
  ai,
  busy,
  onCitation,
  onAnalyze,
  onCancel,
  onContinue,
}: {
  detail: Detail;
  criteria: Criterion[];
  rubricVersion: number;
  ai: Workspace['ai'];
  busy: boolean;
  onCitation: (citation: Citation) => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const review = detail.review;
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
            <p>{review.content.summary}</p>
          </div>
          <div className="findings">
            {criteria.map((criterion) => {
              const finding = review.content.criteria.find((f) => f.criterionId === criterion.id);
              if (!finding) return null;
              return (
                <details className="finding" key={criterion.id} open>
                  <summary>
                    <span>{criterion.name}</span>
                    <span className={`coverage ${finding.status}`}>{coverage[finding.status]}</span>
                    <ChevronDown size={15} />
                  </summary>
                  <div className="finding-content">
                    <p>{finding.finding}</p>
                    {finding.evidence.map((cite) => (
                      <button
                        type="button"
                        className="evidence-quote"
                        key={cite.paragraphId + cite.quote}
                        onClick={() => onCitation(cite)}
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
                </details>
              );
            })}
          </div>
          {review.content.flags.length > 0 && (
            <div className="review-flags">
              <h4>Items for attention</h4>
              {review.content.flags.map((flag) => (
                <div key={flag.paragraphId + flag.quote}>
                  <p>{flag.message}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      onCitation({
                        paragraphId: flag.paragraphId,
                        quote: flag.quote,
                      })
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
        <button type="button" className="button primary full" onClick={onContinue}>
          Continue to your assessment
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
