import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import { detailSchema } from './contracts';
import type { Criterion, Detail } from './contracts';
import useAutosave from './useAutosave';
import type { Draft, FlushDraft } from './useAutosave';

export default function useAssessmentDraft({
  detail,
  criteria,
  analysisRunning,
  recordingPreflight,
  onSaved,
  onFeedback,
  onRegister,
  onRecorded,
  onRecordFailed,
}: {
  detail: Detail;
  criteria: Criterion[];
  analysisRunning: boolean;
  recordingPreflight: boolean;
  onSaved: (next: Detail) => void;
  onFeedback: (message: string) => void;
  onRegister: (flush: FlushDraft | null) => void;
  onRecorded: () => void;
  onRecordFailed: () => void;
}) {
  const reviewId = detail.review?.id ?? null;
  const [fields, setFields] = useState<Draft>(() => ({
    scores: detail.assessment?.scores ?? Object.fromEntries(criteria.map((c) => [c.id, null])),
    rationale: detail.assessment?.rationale ?? '',
    outcome: detail.assessment?.outcome ?? '',
    confirmed:
      detail.assessment?.finalized || detail.assessment?.reviewId === reviewId
        ? (detail.assessment?.confirmed ?? false)
        : false,
    reviewId,
  }));
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const previousReview = useRef(reviewId);
  useEffect(() => {
    if (previousReview.current !== reviewId) {
      previousReview.current = reviewId;
      setFields((current) => ({ ...current, confirmed: false, reviewId }));
    }
  }, [reviewId]);
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
  const draft = { ...fields, reviewId };
  const autosave = useAutosave({
    detail,
    value: draft,
    paused: analysisRunning,
    enabled: !detail.assessment?.finalized && !finalizing,
    recording: finalizing || recordingPreflight,
    onSaved,
    onRegister: registerPersistence,
  });
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const update = (patch: Partial<Draft>) => {
    setFields((current) => ({ ...current, ...patch }));
    setError('');
  };
  const updateScore = (id: string, value: number) => {
    setFields((current) => ({ ...current, scores: { ...current.scores, [id]: value } }));
    setError('');
  };
  const finalize = () => {
    if (finalRequest.current || analysisRunning) return Promise.resolve(false);
    setFinalizing(true);
    setError('');
    const operation = (async () => {
      try {
        if (!(await autosave.flush())) {
          onRecordFailed();
          return false;
        }
        const next = await api(`/api/entries/${detail.entry.id}/assessment`, detailSchema, {
          method: 'PUT',
          body: JSON.stringify({
            ...latestDraft.current,
            expectedRevision: detail.entry.revision,
            expectedVersion: autosave.getVersion(),
            finalize: true,
          }),
        });
        onSaved(next);
        onRecorded();
        onFeedback('Recommendation recorded. This version is now locked and ready to export.');
        return true;
      } catch (cause) {
        setError(errorText(cause));
        onRecordFailed();
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
  };
  return { draft, update, updateScore, autosave, finalizing, error, finalize };
}
