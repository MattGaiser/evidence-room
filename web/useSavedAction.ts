import { useCallback, useRef, useState } from 'react';
import type { FlushDraft } from './useAutosave';

export type PendingAction =
  'entry' | 'export' | 'new' | 'revision' | 'reload' | 'analysis' | 'finalize';

// One synchronous gate protects every action that depends on acknowledged drafts.
export default function useSavedAction({
  cancelAnalysis,
  feedback,
  onBlocked,
}: {
  cancelAnalysis: () => void;
  feedback: (message: string) => void;
  onBlocked: (kind: PendingAction) => void;
}) {
  const persistDraft = useRef<FlushDraft | null>(null);
  const active = useRef(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const registerDraft = useCallback((flush: FlushDraft | null) => {
    persistDraft.current = flush;
  }, []);
  const run = async (
    action: () => void | boolean | Promise<void> | Promise<boolean>,
    cancel = false,
    kind: PendingAction = 'entry',
  ) => {
    if (active.current) {
      feedback('Finishing the current save before continuing.');
      return false;
    }
    active.current = true;
    setPendingAction(kind);
    try {
      if (cancel) cancelAnalysis();
      if (persistDraft.current && !(await persistDraft.current())) {
        feedback('Save failed. Your changes are still here.');
        onBlocked(kind);
        return false;
      }
      return (await action()) !== false;
    } finally {
      active.current = false;
      setPendingAction(null);
    }
  };
  return { run, pendingAction, registerDraft };
}
