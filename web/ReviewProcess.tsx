import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleAlert,
  Download,
  LoaderCircle,
  LockKeyhole,
} from 'lucide-react';
import { outcomeLabels } from './assessment';
import type { Criterion, Detail } from './contracts';
import Dialog from './Dialog';
import EvidenceReview from './EvidenceReview';
import useAssessmentDraft from './useAssessmentDraft';
import DraftSaveStatus from './DraftSaveStatus';
import RecommendationFields from './RecommendationFields';
import type { FlushDraft } from './useAutosave';
import ActionButton from './ActionButton';
import { focusPanelHeading } from './focus';

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
    | 'scoreInvalid'
    | 'saveControls'
  >;
  onReview: (focusId?: string) => void;
  onRecommend: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const recoveryFocus = useRef(false);
  const { draft, update, updateScore, autosave, finalizing, error, finalize } = useAssessmentDraft({
    detail,
    criteria,
    analysisRunning,
    recordingPreflight: transitionPending && confirming,
    onSaved,
    onFeedback,
    onRegister,
    onRecorded: () => setConfirming(false),
    onRecordFailed: () => {
      recoveryFocus.current = true;
      setConfirming(false);
    },
  });
  const { scores, rationale, outcome, confirmed } = draft;
  const [criterionIndex, setCriterionIndex] = useState(0);
  const [explaining, setExplaining] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const showValidation = explaining || attempted;
  const editCriterion = (id: string) => {
    setCriterionIndex(criteria.findIndex((criterion) => criterion.id === id));
    onReview('criterion-score-title');
  };
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
  const rationaleMissing = rationale.trim().length < 40;
  const requirements = [
    ...missingScores.map((criterion) => ({
      id: `score-${criterion.id}`,
      text: `Score ${criterion.name}.`,
      focus: () => editCriterion(criterion.id),
    })),
    ...(rationaleMissing
      ? [
          {
            id: 'rationale',
            text:
              rationale.trim().length === 0
                ? 'Write your rationale (at least 40 characters).'
                : `Add ${40 - rationale.trim().length} more ${rationale.trim().length === 39 ? 'character' : 'characters'} to your rationale.`,
            focus: () => focusPanelHeading(document.getElementById('assessment-rationale')),
          },
        ]
      : []),
    ...(outcome === ''
      ? [
          {
            id: 'outcome',
            text: 'Choose a recommendation.',
            focus: () => focusPanelHeading(document.getElementById('recommendation')),
          },
        ]
      : []),
    ...(!confirmed
      ? [
          {
            id: 'confirmation',
            text: 'Confirm that you made an independent assessment.',
            focus: () => focusPanelHeading(document.getElementById('independent-review')),
          },
        ]
      : []),
  ];
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
  const draftControls = (
    <DraftSaveStatus
      autosave={autosave}
      error={error}
      finalizing={finalizing}
      analysisRunning={analysisRunning}
      hasSavedDraft={detail.assessment !== null}
      onReload={onReload}
    />
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
          onScore={updateScore}
          scoreDisabled={finalizing}
          scoreInvalid={showValidation}
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
              <RecommendationFields
                criteria={criteria}
                draft={draft}
                disabled={finalizing}
                showValidation={showValidation}
                onChange={update}
                onEdit={editCriterion}
              />
              {active === 'decision' && draftControls}
              <div className="score-actions">
                {showValidation && (
                  <div className="visually-hidden">
                    {requirements.map((item) => (
                      <span key={item.id} id={'requirement-' + item.id}>
                        {item.text}
                      </span>
                    ))}
                  </div>
                )}
                <ActionButton
                  className="button primary full"
                  disabled={
                    finalizing || transitionPending || analysisRunning || !!autosave.error || !ready
                  }
                  onClick={() => setConfirming(true)}
                  onExplainChange={setExplaining}
                  onBlocked={() => {
                    setAttempted(true);
                    if (!finalizing && !transitionPending && !analysisRunning && !autosave.error)
                      requirements[0]?.focus();
                  }}
                  explanation={
                    <>
                      {finalizing || transitionPending ? (
                        <p>Wait for the current save to finish.</p>
                      ) : analysisRunning ? (
                        <p>Wait for the analysis to finish. You can keep editing.</p>
                      ) : autosave.error ? (
                        <p>Resolve the save error above before finalizing.</p>
                      ) : null}
                      {requirements.length > 0 && (
                        <div className="missing-requirements">
                          <p>
                            <CircleAlert size={16} aria-hidden="true" />
                            Complete these before finalizing:
                          </p>
                          <ul>
                            {requirements.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => {
                                    setAttempted(true);
                                    item.focus();
                                  }}
                                >
                                  {item.text}
                                  <ArrowLeft size={14} aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  }
                >
                  Finalize
                  <ArrowRight size={16} />
                </ActionButton>
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
