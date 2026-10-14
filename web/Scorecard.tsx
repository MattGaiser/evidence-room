import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  ChevronDown,
  Download,
  LoaderCircle,
  LockKeyhole,
  Save,
} from 'lucide-react';
import { api, errorText, outcomeLabels } from './types';
import type { Criterion, Detail } from './types';
import Dialog from './Dialog';
import { focusPanelHeading } from './focus';

const scale = [
  'Not addressed',
  'Claim only',
  'Preliminary evidence',
  'Measured, with limits',
  'Independently corroborated',
];

export default function Scorecard({
  detail,
  analysisRunning,
  criteria,
  onSaved,
  onFeedback,
  onDirty,
  onSaving,
  onExport,
}: {
  detail: Detail;
  analysisRunning: boolean;
  criteria: Criterion[];
  onSaved: (value: Detail) => void;
  onFeedback: (message: string) => void;
  onDirty: (value: boolean) => void;
  onSaving: (value: boolean) => void;
  onExport: () => void;
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
  const [phase, setPhase] = useState(0);
  const phaseHeading = useRef<HTMLHeadingElement>(null);
  const pendingCriterion = useRef<string | null>(null);
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    const frame = requestAnimationFrame(() => {
      if (phase === 0 && pendingCriterion.current) {
        const criterion = document.getElementById(
          pendingCriterion.current,
        ) as HTMLDetailsElement | null;
        pendingCriterion.current = null;
        if (criterion) {
          criterion.open = true;
          const input = criterion.querySelector('input');
          input?.focus({ preventScroll: true });
          input?.scrollIntoView({ block: 'center' });
        }
      } else focusPanelHeading(phaseHeading.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);
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
  return (
    <section
      className={`scorecard panel ${finalized ? 'final-scorecard' : ''}`}
      aria-labelledby="scorecard-title"
    >
      <div className="scorecard-top">
        <div>
          <h2 id="scorecard-title" ref={resultHeading} tabIndex={-1}>
            {finalized ? 'Recommendation recorded' : 'Score and recommend'}
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
          <nav className="assessment-pages" aria-label="Assessment pages">
            <button
              type="button"
              aria-current={phase === 0 ? 'step' : undefined}
              onClick={() => setPhase(0)}
            >
              1 Scores
            </button>
            <button
              type="button"
              aria-current={phase === 1 ? 'step' : undefined}
              onClick={() => setPhase(1)}
            >
              2 Recommendation
            </button>
          </nav>
          <h3 className="assessment-page-title" ref={phaseHeading} tabIndex={-1}>
            {phase === 0 ? 'Score the four criteria' : 'Explain your recommendation'}
          </h3>
          <div hidden={phase !== 0}>
            <p className="section-description">
              Choose a score from 0 to 4 for each criterion. Selecting a score opens the next
              unscored section. You can change any score before finalizing.
            </p>
            <details className="scale-guide">
              <summary>How the 0–4 scale works</summary>
              <ol start={0}>
                {scale.map((label, index) => (
                  <li key={label}>
                    <strong>{index}</strong>
                    <span>{label}</span>
                  </li>
                ))}
              </ol>
              <p>Use the same evidence standard for every submission.</p>
            </details>
            <div className="score-criteria">
              {criteria.map((criterion, index) => (
                <details
                  className="score-criterion"
                  id={`score-criterion-${criterion.id}`}
                  key={criterion.id}
                  open={index === 0 ? true : undefined}
                >
                  <summary>
                    <span>
                      {criterion.name}
                      <small>{criterion.weight}% of total</small>
                    </span>
                    <strong>
                      {scores[criterion.id] === null ? (
                        <span className="choose-score">Choose score</span>
                      ) : (
                        <>
                          {scores[criterion.id]}
                          <small>/4</small>
                        </>
                      )}
                    </strong>
                    <ChevronDown className="score-chevron" size={18} aria-hidden="true" />
                  </summary>
                  <div className="score-criterion-body">
                    <p>{criterion.description}</p>
                    <fieldset className="score-options">
                      <legend className="visually-hidden">{criterion.name} score</legend>
                      {scale.map((label, value) => (
                        <label
                          key={label}
                          className={scores[criterion.id] === value ? 'selected' : ''}
                        >
                          <input
                            type="radio"
                            disabled={busy}
                            name={`score-${criterion.id}`}
                            value={value}
                            checked={scores[criterion.id] === value}
                            onChange={() => {
                              setScores((s) => ({ ...s, [criterion.id]: value }));
                              changed();
                              if (scores[criterion.id] === null) {
                                const next = criteria
                                  .slice(index + 1)
                                  .find((item) => scores[item.id] === null);
                                const section = next
                                  ? (document.getElementById(
                                      `score-criterion-${next.id}`,
                                    ) as HTMLDetailsElement | null)
                                  : null;
                                if (section) section.open = true;
                              }
                            }}
                          />
                          <span aria-hidden="true">{value}</span>
                          <span className="visually-hidden">
                            {value} — {label}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <p className="selected-score" role="status">
                      {scores[criterion.id] === null
                        ? 'No score selected.'
                        : `${scores[criterion.id]} of 4 — ${scale[scores[criterion.id] ?? 0]}`}
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </div>
          <div hidden={phase !== 1}>
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
                  onClick={() => {
                    pendingCriterion.current = `score-criterion-${missingScores[0].id}`;
                    setPhase(0);
                  }}
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
          </div>
          {error && (
            <p className="error-panel" role="alert">
              {error}
            </p>
          )}
          <div className="score-actions">
            {analysisRunning && (
              <p className="field-help">
                Analysis is running. Keep editing; save or finalize after it finishes.
              </p>
            )}
            <p className={dirty ? 'unsaved' : 'muted'} role="status">
              {busy
                ? 'Saving scorecard…'
                : dirty
                  ? 'Unsaved changes'
                  : detail.assessment
                    ? 'Draft saved on this device'
                    : 'No scores entered yet'}
            </p>
            <div>
              {phase === 1 && (
                <button type="button" className="button secondary" onClick={() => setPhase(0)}>
                  <ArrowLeft size={16} />
                  Back to scores
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={busy || analysisRunning || !dirty}
                onClick={() => void save(false)}
              >
                <Save size={16} />
                Save draft
              </button>
              {phase === 0 ? (
                <button type="button" className="button primary" onClick={() => setPhase(1)}>
                  Next: recommendation
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || analysisRunning || !ready}
                  onClick={() => setConfirming(true)}
                >
                  Finalize
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            {phase === 1 && !ready && (
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
  );
}
