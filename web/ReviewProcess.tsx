import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Download,
  LoaderCircle,
  LockKeyhole,
  Save,
} from 'lucide-react';
import { api, errorText, outcomeLabels } from './types';
import type { Criterion, Detail } from './types';
import Dialog from './Dialog';
import EvidenceReview from './EvidenceReview';
import { scoreLabels } from './CriterionScore';

export default function ReviewProcess({
  detail,
  analysisRunning,
  criteria,
  onSaved,
  onFeedback,
  onDirty,
  onSaving,
  onExport,
  active,
  evidence,
  onReview,
  onRecommend,
}: {
  detail: Detail;
  analysisRunning: boolean;
  criteria: Criterion[];
  onSaved: (value: Detail) => void;
  onFeedback: (message: string) => void;
  onDirty: (value: boolean) => void;
  onSaving: (value: boolean) => void;
  onExport: () => void;
  active: 'submission' | 'evidence' | 'decision';
  evidence: Omit<
    ComponentProps<typeof EvidenceReview>,
    | 'detail'
    | 'criteria'
    | 'onContinue'
    | 'criterionIndex'
    | 'onCriterionIndex'
    | 'scores'
    | 'onScore'
    | 'scoreDisabled'
    | 'saveControls'
  >;
  onReview: (focusId?: string) => void;
  onRecommend: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number | null>>(
    detail.assessment?.scores ?? Object.fromEntries(criteria.map((c) => [c.id, null])),
  );
  const [rationale, setRationale] = useState(detail.assessment?.rationale ?? '');
  const [outcome, setOutcome] = useState(detail.assessment?.outcome ?? '');
  const [confirmed, setConfirmed] = useState(
    detail.assessment?.finalized || detail.assessment?.reviewId === (detail.review?.id ?? null)
      ? (detail.assessment?.confirmed ?? false)
      : false,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [criterionIndex, setCriterionIndex] = useState(0);
  const editCriterion = (id: string) => {
    setCriterionIndex(criteria.findIndex((criterion) => criterion.id === id));
    onReview('criterion-score-title');
  };
  const reviewId = detail.review?.id ?? null;
  const previousReview = useRef(reviewId);
  useEffect(() => {
    if (previousReview.current !== reviewId) {
      previousReview.current = reviewId;
      setConfirmed(false);
      setDirty(true);
    }
  }, [reviewId]);
  const finalized = detail.assessment?.finalized === true;
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (finalized) {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.scrollIntoView({ block: 'center' });
    }
  }, [finalized]);
  const complete = criteria.every((c) => scores[c.id] !== null);
  const missingScores = criteria.filter((criterion) => scores[criterion.id] === null);
  const total = complete
    ? criteria.reduce((n, c) => n + ((scores[c.id] ?? 0) / 4) * c.weight, 0)
    : null;
  const ready = complete && rationale.trim().length >= 40 && outcome !== '' && confirmed;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const changed = () => {
    setDirty(true);
    setError('');
  };
  async function save(finalize: boolean) {
    if (busy || analysisRunning) return;
    setBusy(true);
    onSaving(true);
    setError('');
    try {
      const next = await api<Detail>(`/api/entries/${detail.entry.id}/assessment`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: detail.entry.revision,
          expectedVersion: detail.assessment?.version ?? 0,
          reviewId: detail.review?.id ?? null,
          scores,
          rationale,
          outcome,
          confirmed,
          finalize,
        }),
      });
      setDirty(false);
      onSaved(next);
      setConfirming(false);
      onFeedback(
        finalize
          ? 'Recommendation recorded. This version is now locked and ready to export.'
          : 'Scorecard draft saved.',
      );
    } catch (e) {
      setError(errorText(e));
      setConfirming(false);
    } finally {
      setBusy(false);
      onSaving(false);
    }
  }
  const draftControls = (
    <div className="draft-controls">
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {analysisRunning && (
        <p className="field-help">
          Analysis is running. Keep editing; save or finalize after it finishes.
        </p>
      )}
      <div className="draft-save-row">
        <p className={dirty ? 'unsaved' : 'muted'} role="status">
          {busy
            ? 'Saving scorecard...'
            : dirty
              ? 'Unsaved changes'
              : detail.assessment
                ? 'Draft saved on this device'
                : 'No scores entered yet'}
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={busy || analysisRunning || !dirty}
          onClick={() => void save(false)}
        >
          <Save size={16} />
          Save draft
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div hidden={active !== 'evidence'}>
        <EvidenceReview
          {...evidence}
          detail={detail}
          criteria={criteria}
          criterionIndex={criterionIndex}
          onCriterionIndex={setCriterionIndex}
          scores={scores}
          onScore={(id, value) => {
            setScores((current) => ({ ...current, [id]: value }));
            changed();
          }}
          scoreDisabled={busy}
          saveControls={finalized || active !== 'evidence' ? null : draftControls}
          onContinue={onRecommend}
        />
      </div>
      <div hidden={active !== 'decision'}>
        <section
          className={`scorecard panel ${finalized ? 'final-scorecard' : ''}`}
          aria-labelledby="scorecard-title"
        >
          <div className="scorecard-top">
            <div>
              <h2 id="scorecard-title" ref={resultHeading} tabIndex={-1}>
                {finalized ? 'Recommendation recorded' : 'Your recommendation'}
              </h2>
            </div>
            {finalized ? (
              <LockKeyhole size={22} />
            ) : (
              <span className="score-total">
                {total === null ? '—' : total.toFixed(1)}
                <small>/ 100</small>
              </span>
            )}
          </div>
          {finalized ? (
            <div className="recorded-call">
              <CircleCheck size={28} />
              <h3>{outcomeLabels[detail.assessment?.outcome ?? '']}</h3>
              <p>
                {detail.assessment?.total?.toFixed(1)} / 100 · submission v{detail.entry.revision}
              </p>
              <p className="recorded-rationale">{detail.assessment?.rationale}</p>
              <button type="button" className="button primary" onClick={onExport}>
                <Download size={16} />
                Export case packet
              </button>
            </div>
          ) : (
            <>
              <p className="section-description">
                Check the scores you entered while reviewing the evidence, then explain your
                recommendation.
              </p>
              <ul className="score-summary" aria-label="Your criterion scores">
                {criteria.map((criterion) => (
                  <li key={criterion.id}>
                    <div>
                      <strong>{criterion.name}</strong>
                      <small>{criterion.weight}% of total</small>
                    </div>
                    <span>
                      {scores[criterion.id] === null
                        ? 'Not scored'
                        : `${scores[criterion.id]} / 4: ${scoreLabels[scores[criterion.id] ?? 0]}`}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Edit ${criterion.name} score`}
                      onClick={() => editCriterion(criterion.id)}
                    >
                      Edit score
                      <ArrowLeft size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              {missingScores.length > 0 && (
                <div className="missing-scores">
                  <p>
                    {missingScores.length}{' '}
                    {missingScores.length === 1
                      ? 'criterion still needs a score'
                      : 'criteria still need scores'}
                    .
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => editCriterion(missingScores[0].id)}
                  >
                    Complete missing scores
                    <ArrowLeft size={16} />
                  </button>
                </div>
              )}
              <label className="field">
                <span>Your rationale</span>
                <textarea
                  disabled={busy}
                  rows={4}
                  maxLength={4000}
                  value={rationale}
                  onChange={(e) => {
                    setRationale(e.target.value);
                    changed();
                  }}
                  placeholder="Explain how the evidence and its limitations support your recommendation."
                  aria-describedby="rationale-help"
                />
              </label>
              <p id="rationale-help" className="field-help">
                At least 40 characters to finalize.
              </p>
              <div className="field">
                <label htmlFor="recommendation">Recommendation</label>
                <select
                  disabled={busy}
                  id="recommendation"
                  value={outcome}
                  onChange={(e) => {
                    setOutcome(e.target.value);
                    changed();
                  }}
                >
                  <option value="">Choose a recommendation</option>
                  {Object.entries(outcomeLabels).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="confirmation">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                    changed();
                  }}
                />
                <span>I checked the submission and made an independent assessment.</span>
              </label>
              {active === 'decision' && draftControls}
              <div className="score-actions">
                <button
                  type="button"
                  className="button primary full"
                  disabled={busy || analysisRunning || !ready}
                  onClick={() => setConfirming(true)}
                >
                  Finalize
                  <ArrowRight size={16} />
                </button>
                {!ready && (
                  <p className="field-help">
                    To finalize: complete four scores, a rationale, a recommendation, and the
                    confirmation.
                  </p>
                )}
              </div>
            </>
          )}
          {confirming && (
            <Dialog
              title="Record this recommendation?"
              onClose={() => {
                if (!busy) setConfirming(false);
              }}
            >
              <div className="final-preview">
                <span className="final-preview-icon">
                  <Check size={30} />
                </span>
                <h3>{outcomeLabels[outcome]}</h3>
                <p className="final-preview-score">
                  {total?.toFixed(1)} <span>/ 100</span>
                </p>
                <p>
                  This locks your scorecard for submission v{detail.entry.revision}. The evidence
                  analysis and rubric version stay linked to the record.
                </p>
              </div>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Record
                  recommendation
                </button>
              </div>
            </Dialog>
          )}
        </section>
      </div>
    </>
  );
}
