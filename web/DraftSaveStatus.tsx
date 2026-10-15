import { RefreshCw } from 'lucide-react';
import type useAutosave from './useAutosave';

export default function DraftSaveStatus({
  autosave,
  error,
  finalizing,
  analysisRunning,
  hasSavedDraft,
  onReload,
}: {
  autosave: ReturnType<typeof useAutosave>;
  error: string;
  finalizing: boolean;
  analysisRunning: boolean;
  hasSavedDraft: boolean;
  onReload: () => void;
}) {
  return (
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
              : hasSavedDraft
                ? 'All changes saved'
                : 'Changes save automatically'}
      </p>
    </div>
  );
}
