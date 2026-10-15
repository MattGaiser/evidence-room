import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { detailSchema } from './contracts';
import type { Detail } from './contracts';

export default function useAnalysis({
  onSaved,
  feedback,
  onError,
  refresh,
}: {
  onSaved: (next: Detail) => void;
  feedback: (message: string) => void;
  onError: (error: unknown) => void;
  refresh: () => Promise<void>;
}) {
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const cancel = () => {
    if (!request.current) return;
    request.current.abort();
    request.current = null;
    setBusy(false);
    feedback('Analysis canceled. Your submission and scorecard are unchanged.');
  };
  const run = async (detail: Detail) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const next = await api(`/api/entries/${detail.entry.id}/analysis`, detailSchema, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: detail.entry.revision }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]),
      });
      if (request.current !== controller) return;
      onSaved(next);
      feedback(
        'AI analysis saved. Open a quotation to check its source, then review the findings.',
      );
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) onError(error);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        void refresh().catch(() => {});
      }
    }
  };
  return { busy, run, cancel };
}
