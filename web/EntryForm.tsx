import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import Dialog from './Dialog';
import { api, errorText } from './api';
import type { Detail } from './types';

export default function EntryForm({
  detail,
  onClose,
  onSaved,
}: {
  detail: Detail | null;
  onClose: () => void;
  onSaved: (value: Detail) => void;
}) {
  const [team, setTeam] = useState(detail?.entry.team ?? '');
  const [title, setTitle] = useState(detail?.entry.title ?? '');
  const [body, setBody] = useState(
    detail?.submission.paragraphs.map((p) => p.text).join('\n\n') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const close = () => {
    if (!busy && (!dirty || window.confirm('Discard the unsaved submission text?'))) onClose();
  };
  return (
    <Dialog
      title={detail ? 'Submit a new version' : 'Add a submission'}
      onClose={close}
      className="entry-dialog"
    >
      <p className="dialog-intro">
        {detail
          ? 'The current submission stays in the case history. A new version starts a fresh evidence review and scorecard.'
          : 'Add the team’s application or milestone narrative to the review queue.'}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const value = await api<Detail>(
              detail ? `/api/entries/${detail.entry.id}` : '/api/entries',
              {
                method: detail ? 'PUT' : 'POST',
                body: JSON.stringify({
                  team,
                  title,
                  body,
                  expectedRevision: detail?.entry.revision ?? null,
                }),
              },
            );
            onSaved(value);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Team name</span>
          <input
            required
            disabled={busy || detail !== null}
            maxLength={80}
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="field">
          <span>Submission title</span>
          <input
            required
            disabled={busy}
            maxLength={120}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="field">
          <span>Submission narrative</span>
          <textarea
            required
            disabled={busy}
            minLength={80}
            maxLength={16000}
            rows={10}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            aria-describedby="narrative-help"
          />
        </label>
        <p id="narrative-help" className="field-help">
          80–16,000 characters. Separate passages with a blank line.
        </p>
        {error && (
          <p role="alert" className="error-panel">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
            {busy ? 'Saving submission…' : detail ? 'Save new version' : 'Add to review queue'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
