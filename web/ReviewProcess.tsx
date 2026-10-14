import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Download,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react';
import { api, errorText, outcomeLabels } from './types';
import type { Criterion, Detail } from './types';
import Dialog from './Dialog';
import EvidenceReview from './EvidenceReview';
import { scoreLabels } from './CriterionScore';
import useAutosave from './useAutosave';
import type { FlushDraft } from './useAutosave';

export default function ReviewProcess({
  detail,
  analysisRunning,
  criteria,
  onSaved,
  onFeedback,
  onRegister,
  onReload,
  transitionPending,
  onFinalize,
  exporting,
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
  onRegister: (flush: FlushDraft | null) => void;
  onReload: () => void;
  transitionPending: boolean;
  onFinalize: (action: () => Promise<boolean>) => Promise<boolean>;
  exporting: boolean;
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
  const [finalizing, setFinalizing] = useState(false);
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
  const finalRequest = useRef<Promise<boolean> | null>(null);
  const registerPersistence = useCallback(
    (flush: FlushDraft | null) => {
      onRegister(
        flush
          ? async () => {
              if (finalRequest.current && !(await finalRequest.current)) return false;
              return flush();
            }
          : null,
      );
    },
    [onRegister],
  );
  const draft = { scores, rationale, outcome, confirmed, reviewId };
  const autosave = useAutosave({
    detail,
    value: draft,
    paused: analysisRunning,
    enabled: !finalized && !finalizing,
    recording: finalizing || (transitionPending && confirming),
    onSaved,
    onRegister: registerPersistence,
  });
  const recoveryFocus = useRef(false);
  useEffect(() => {
    if (confirming || !recoveryFocus.current) return;
    recoveryFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const panel = document.getElementById('draft-save-error');
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [confirming]);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const changed = () => {
    setError('');
  };
  function finalize() {
    if (finalRequest.current || analysisRunning) return Promise.resolve(false);
    setFinalizing(true);
    setError('');
    const operation = (async () => {
      try {
        if (!(await autosave.flush())) {
          recoveryFocus.current = true;
          setConfirming(false);
          return false;
        }
        const next = await api<Detail>('/api/entries/' + detail.entry.id + '/assessment', {
          method: 'PUT',
          body: JSON.stringify({
            ...latestDraft.current,
            expectedRevision: detail.entry.revision,
            expectedVersion: autosave.getVersion(),
            finalize: true,
          }),
        });
        onSaved(next);
        setConfirming(false);
        onFeedback('Recommendation recorded. This version is now locked and ready to export.');
        return true;
      } catch (cause) {
        setError(errorText(cause));
        recoveryFocus.current = true;
        setConfirming(false);
        return false;
      } finally {
        setFinalizing(false);
      }
    })();
    finalRequest.current = operation;
    void operation.finally(() => {
      finalRequest.current = null;
    });
    return operation;
  }
  const draftControls = (
    <div className="draft-controls">
      {(autosave.error || error) && (
        <div className="error-panel" role="alert" id="draft-save-error" tabIndex={-1}>
          <p>Changes not saved. {autosave.error?.text ?? error}</p>
          <div className="save-recovery">
            {autosave.error && !autosave.error.conflict && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  document.getElementById('autosave-state')?.focus({ preventScroll: true });
                  void autosave.retry();
                }}
                disabled={autosave.saving}
              >
                <RefreshCw size={16} />
                Try saving again
              </button>
            )}
            <button type="button" className="text-button" onClick={onReload}>
              Reload saved draft
            </button>
          </div>
        </div>
      )}
      <p className="autosave-status" role="status" id="autosave-state" tabIndex={-1}>
        {autosave.error
          ? 'Not saved'
          : finalizing
            ? 'Recording recommendation...'
            : autosave.dirty || autosave.saving
              ? analysisRunning
                ? 'Changes will save when analysis finishes.'
                : 'Saving changes...'
              : detail.assessment
                ? 'All changes saved'
                : 'Changes save automatically'}
      </p>
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
          scoreDisabled={finalizing}
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
              <button
                type="button"
                className="button primary"
                onClick={onExport}
                disabled={transitionPending}
              >
                {exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                {exporting ? 'Preparing export...' : 'Export case packet'}
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
                  disabled={finalizing}
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
                  disabled={finalizing}
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
                  disabled={finalizing}
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
                  disabled={
                    finalizing || transitionPending || analysisRunning || !!autosave.error || !ready
                  }
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
                if (!finalizing && !transitionPending) setConfirming(false);
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
                  disabled={finalizing || transitionPending}
                  onClick={() => setConfirming(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={finalizing || transitionPending}
                  onClick={async () => {
                    if (!(await onFinalize(finalize))) {
                      recoveryFocus.current = true;
                      setConfirming(false);
                    }
                  }}
                >
                  {finalizing || transitionPending ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  Record recommendation
                </button>
              </div>
            </Dialog>
          )}
        </section>
      </div>
    </>
  );
}
