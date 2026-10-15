import { detailSchema } from './contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText, ApiError } from './api';
import type { Assessment, Detail } from './contracts';

export type Draft = Pick<Assessment, 'scores' | 'rationale' | 'outcome' | 'confirmed' | 'reviewId'>;
export type FlushDraft = () => Promise<boolean>;

export default function useAutosave({
  detail,
  value,
  paused,
  enabled,
  recording,
  onSaved,
  onRegister,
}: {
  detail: Detail;
  value: Draft;
  paused: boolean;
  enabled: boolean;
  recording: boolean;
  onSaved: (detail: Detail) => void;
  onRegister: (flush: FlushDraft | null) => void;
}) {
  const current = useRef({ detail, value, paused, onSaved, recording });
  current.current = { detail, value, paused, onSaved, recording };
  const acknowledged = useRef(JSON.stringify(value));
  const [saved, setSaved] = useState(acknowledged.current);
  const version = useRef(detail.assessment?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const failure = useRef<typeof error>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const resume = useRef(new Set<() => void>());
  const mounted = useRef(true);
  const serialized = JSON.stringify(value);
  const dirty = serialized !== saved;

  const flush = useCallback(async function drain(): Promise<boolean> {
    if (!mounted.current || failure.current) return false;
    if (inFlight.current) return (await inFlight.current) ? drain() : false;
    if (current.current.paused) {
      await new Promise<void>((resolve) => resume.current.add(resolve));
      return drain();
    }
    const snapshot = JSON.stringify(current.current.value);
    if (snapshot === acknowledged.current) return true;
    const { detail: entry, onSaved: accept } = current.current;
    setSaving(true);
    const operation = (async () => {
      try {
        const next = await api(`/api/entries/${entry.entry.id}/assessment`, detailSchema, {
          method: 'PUT',
          body: JSON.stringify({
            ...JSON.parse(snapshot),
            expectedRevision: entry.entry.revision,
            expectedVersion: version.current,
            finalize: false,
          }),
        });
        if (!mounted.current) return false;
        if (!next.assessment) throw new Error('The server did not return the saved draft.');
        version.current = next.assessment.version;
        // Acknowledge the submitted text, since the server trims the stored rationale.
        acknowledged.current = snapshot;
        setSaved(snapshot);
        accept(next);
        return true;
      } catch (cause) {
        if (mounted.current) {
          failure.current = {
            text: errorText(cause),
            conflict: cause instanceof ApiError && cause.status === 409,
          };
          setError(failure.current);
        }
        return false;
      } finally {
        inFlight.current = null;
        if (mounted.current) setSaving(false);
      }
    })();
    inFlight.current = operation;
    return (await operation) ? drain() : false;
  }, []);

  useEffect(() => {
    if (!paused) {
      for (const resolve of resume.current) resolve();
      resume.current.clear();
    }
  }, [paused]);
  useEffect(() => {
    if (!enabled || paused || serialized === acknowledged.current || error) return;
    const timer = window.setTimeout(() => void flush(), 600);
    return () => clearTimeout(timer);
  }, [serialized, enabled, paused, error, flush]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        JSON.stringify(current.current.value) !== acknowledged.current ||
        inFlight.current ||
        current.current.recording
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    mounted.current = true;
    onRegister(flush);
    const waiting = resume.current;
    return () => {
      mounted.current = false;
      onRegister(null);
      for (const resolve of waiting) resolve();
      waiting.clear();
    };
  }, [flush, onRegister]);

  const retry = () => {
    failure.current = null;
    setError(null);
    return flush();
  };
  return { dirty, saving, error, flush, retry, getVersion: () => version.current };
}
