import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import EntryForm from './EntryForm';
import SubmissionQueue from './SubmissionQueue';
import SubmissionReader from './SubmissionReader';
import EvidenceReview from './EvidenceReview';
import { formatDate } from './format';
import Scorecard from './Scorecard';
import Walkthrough from './Walkthrough';
import Notice from './Notice';
import { api, errorText } from './types';
import type { Citation, Detail, Entry, Workspace } from './types';

const tabs = [
  { id: 'submission', label: 'Read submission', Icon: FileText },
  { id: 'evidence', label: 'Review evidence', Icon: Search },
  { id: 'decision', label: 'Score & recommend', Icon: ClipboardCheck },
] as const;
type Tab = (typeof tabs)[number]['id'];
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get('entry') || 'tidewell',
  );
  const [tab, setTab] = useState<Tab>('submission');
  const [filter, setFilter] = useState('all');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ id: number; text: string; error?: boolean } | null>(null);
  const noticeId = useRef(0);
  const [tour, setTour] = useState(false);
  const openTour = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setTour(true);
  };
  const [form, setForm] = useState<'new' | 'revision' | null>(null);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  const setSaving = useCallback((value: boolean) => {
    saving.current = value;
  }, []);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [reload, setReload] = useState(0);
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const changeTab = (next: Tab) => {
    setTab(next);
    if (window.matchMedia('(max-width: 760px)').matches) setSourceExpanded(next === 'submission');
  };
  const controls = useRef<HTMLDivElement>(null);
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    const frame = requestAnimationFrame(() => {
      const headingId = {
        submission: 'start-title',
        evidence: 'analysis-title',
        decision: 'scorecard-title',
      }[tab];
      if (!controls.current || !document.getElementById(headingId)) return;
      controls.current.scrollTop = 0;
      document.getElementById(headingId)?.focus({ preventScroll: true });
      controls.current.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  const feedback = useCallback((text: string) => setNotice({ id: ++noticeId.current, text }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const notifyError = (e: unknown) =>
    setNotice({ id: ++noticeId.current, text: errorText(e), error: true });
  const workspaceRead = useRef(0);
  const refreshWorkspace = useCallback(async () => {
    const read = ++workspaceRead.current;
    const value = await api<Workspace>('/api/workspace');
    if (read === workspaceRead.current) setWorkspace(value);
  }, []);
  useEffect(() => {
    void reload;
    const read = ++workspaceRead.current;
    let active = true;
    const controller = new AbortController();
    setLoadError('');
    setDetail(null);
    void Promise.all([
      api<Workspace>('/api/workspace', {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      }),
      api<Detail>(`/api/entries/${selected}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      }),
    ])
      .then(([ws, next]) => {
        if (active) {
          if (read === workspaceRead.current) setWorkspace(ws);
          setDetail(next);
        }
      })
      .catch((e) => {
        if (active) setLoadError(errorText(e));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, reload]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('entry', selected);
    window.history.replaceState(null, '', url);
  }, [selected]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    if (citation) {
      const passage = document.getElementById(`passage-${citation.paragraphId}`);
      passage?.focus({ preventScroll: true });
      passage?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [citation]);
  const acceptDetail = (next: Detail) => {
    ++workspaceRead.current;
    setDetail(next);
    setWorkspace((old) =>
      old
        ? { ...old, entries: old.entries.map((e) => (e.id === next.entry.id ? next.entry : e)) }
        : old,
    );
  };
  const canLeave = () => {
    if (saving.current) {
      feedback('Wait for the scorecard save to finish before leaving this entry.');
      return false;
    }
    return !dirtyRef.current || window.confirm('Leave without saving the scorecard changes?');
  };
  const cancelAnalysis = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    feedback('Analysis canceled. Your submission and scorecard are unchanged.');
  };
  const selectEntry = (entry: Entry) => {
    if (entry.id === selected || !canLeave()) return;
    if (busy) cancelAnalysis();
    setSelected(entry.id);
    changeTab('submission');
    setDirty(false);
    setCitation(null);
    window.scrollTo({ top: 0 });
  };
  const reloadEntry = () => {
    if (canLeave()) {
      if (busy) cancelAnalysis();
      setReload((n) => n + 1);
      setDirty(false);
      setCitation(null);
      feedback('Reloading the latest saved entry.');
    }
  };
  const showCitation = (next: Citation) => {
    setCitation({ ...next });
    setSourceExpanded(true);
  };
  async function runAnalysis() {
    if (!detail || busy) return;
    if (saving.current) {
      feedback('Wait for the scorecard save to finish before running an analysis.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const next = await api<Detail>(`/api/entries/${detail.entry.id}/analysis`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: detail.entry.revision }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]),
      });
      if (request.current !== controller) return;
      acceptDetail(next);
      feedback(
        'AI analysis saved. Open a quotation to check its source, then review the findings.',
      );
      changeTab('evidence');
    } catch (e) {
      if (!controller.signal.aborted && request.current === controller) notifyError(e);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        void refreshWorkspace().catch(() => {});
      }
    }
  }
  async function exportPacket() {
    if (!detail) return;
    try {
      const response = await fetch(`/api/entries/${detail.entry.id}/export`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('The export could not be created. Try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `evidence-room-${detail.entry.id}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback(
        dirty
          ? 'Saved case packet exported. Your unsaved scorecard edits are not included; save them to export an updated packet.'
          : 'Case packet exported with the rubric, submission versions, analyses, and saved assessment.',
      );
    } catch (e) {
      notifyError(e);
    }
  }
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to review
      </a>
      <header className="app-header">
        <a className="brand" href="#main">
          <span className="brand-mark">
            <Layers3 size={22} />
          </span>
          evidence<span className="brand-light">room</span>
          <span className="brand-dot">.</span>
        </a>
        <div className="header-actions">
          <button
            type="button"
            className="text-button"
            aria-label="How it works"
            onClick={openTour}
          >
            <CircleHelp size={17} />
            <span>How it works</span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="round-heading">
          <div>
            <p className="eyebrow">{workspace?.competition.round ?? 'Submission review'}</p>
            <h1>{workspace?.competition.name ?? 'Evidence Room'}</h1>
            <p>Check submission evidence, score the rubric, and record a recommendation.</p>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={!workspace || busy}
            onClick={() => {
              if (canLeave()) setForm('new');
            }}
          >
            <Plus size={17} />
            Add submission
          </button>
        </div>
        {loadError ? (
          <div className="loading-panel error-panel" role="alert">
            <h2>The workspace could not load.</h2>
            <p>{loadError}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        ) : !workspace || !detail ? (
          <div className="loading-panel" role="status">
            <LoaderCircle size={24} className="spin" />
            <p>Opening the review workspace…</p>
          </div>
        ) : (
          <div className="workspace-layout">
            <SubmissionQueue
              entries={workspace.entries}
              selected={selected}
              filter={filter}
              onFilter={setFilter}
              onSelect={selectEntry}
            />
            <div className="review-workspace">
              <div className="entry-heading">
                <div>
                  <p className="team-name">
                    {detail.entry.team}
                    <span>Submission v{detail.entry.revision}</span>
                  </p>
                  <h2>{detail.entry.title}</h2>
                </div>
                <button
                  type="button"
                  className="icon-button export-top"
                  aria-label="Export case packet"
                  onClick={() => void exportPacket()}
                >
                  <ArrowDownToLine size={19} />
                </button>
              </div>
              <nav className="review-tabs" aria-label="Review steps">
                {tabs.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={tab === item.id ? 'active' : ''}
                    aria-current={tab === item.id ? 'step' : undefined}
                    onClick={() => {
                      changeTab(item.id);
                      setCitation(null);
                    }}
                  >
                    <span className="tab-number">{index + 1}</span>
                    <item.Icon size={16} />
                    <span>{item.label}</span>
                    {tab === item.id ? <i /> : null}
                  </button>
                ))}
              </nav>
              <div className={`case-layout ${tab === 'submission' ? 'reading-layout' : ''}`}>
                <SubmissionReader
                  detail={detail}
                  citation={citation}
                  expanded={sourceExpanded}
                  disabled={busy}
                  onToggle={() => setSourceExpanded((value) => !value)}
                  onRevise={() => {
                    if (canLeave()) setForm('revision');
                  }}
                />
                <div className="case-controls" ref={controls}>
                  <section
                    hidden={tab !== 'submission'}
                    className="panel start-review"
                    aria-labelledby="start-title"
                  >
                    <h3 id="start-title" tabIndex={-1}>
                      Review this submission
                    </h3>
                    <p>
                      Check the team’s results, costs, pilot plan, and community benefit. Decide
                      whether to recommend a pilot or request more information.
                    </p>
                    <ol className="review-path">
                      <li>
                        <span>1</span>
                        <div>
                          <strong>Read the original</strong>
                          <p>Separate measured results from projections.</p>
                        </div>
                      </li>
                      <li>
                        <span>2</span>
                        <div>
                          <strong>Trace the findings</strong>
                          <p>Check each quotation and open question.</p>
                        </div>
                      </li>
                      <li>
                        <span>3</span>
                        <div>
                          <strong>Record your judgment</strong>
                          <p>Score independently and explain your decision.</p>
                        </div>
                      </li>
                    </ol>
                    <button
                      type="button"
                      className="button primary full"
                      onClick={() => changeTab('evidence')}
                    >
                      Review the evidence
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  <div hidden={tab !== 'evidence'}>
                    <EvidenceReview
                      detail={detail}
                      criteria={workspace.competition.criteria}
                      rubricVersion={workspace.competition.version}
                      ai={workspace.ai}
                      busy={busy}
                      onCitation={showCitation}
                      onAnalyze={() => void runAnalysis()}
                      onCancel={cancelAnalysis}
                      onContinue={() => changeTab('decision')}
                    />
                  </div>
                  <div hidden={tab !== 'decision'}>
                    <Scorecard
                      key={`${detail.entry.id}-${detail.entry.revision}-${reload}`}
                      detail={detail}
                      analysisRunning={busy}
                      criteria={workspace.competition.criteria}
                      onSaved={acceptDetail}
                      onFeedback={feedback}
                      onDirty={setDirty}
                      onSaving={setSaving}
                      onExport={() => void exportPacket()}
                    />
                  </div>
                </div>
              </div>
              <details className="history panel">
                <summary>
                  <History size={17} />
                  <span>Case history</span>
                  <small>
                    {detail.events.length} {detail.events.length === 1 ? 'event' : 'events'}
                  </small>
                  <ChevronDown size={16} />
                </summary>
                <div>
                  <ol>
                    {detail.events.map((event) => (
                      <li key={event.id}>
                        <span className="event-dot" />
                        <div>
                          <strong>{event.message}</strong>
                          <span>
                            {formatDate(event.createdAt)} · Submission v{event.revision}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="text-button" onClick={reloadEntry}>
                    <RefreshCw size={14} />
                    Reload saved entry
                  </button>
                </div>
              </details>
            </div>
          </div>
        )}
      </main>
      <Notice message={notice} dismiss={dismissNotice} />
      {tour && <Walkthrough onClose={() => setTour(false)} />}
      {form && (
        <EntryForm
          detail={form === 'revision' ? detail : null}
          onClose={() => setForm(null)}
          onSaved={(next) => {
            setForm(null);
            setDirty(false);
            if (next.entry.id === selected) {
              acceptDetail(next);
              setCitation(null);
              changeTab('submission');
            } else {
              setSelected(next.entry.id);
              changeTab('submission');
            }
            void refreshWorkspace().catch(() => {});
            feedback(
              next.entry.revision === 1
                ? 'Submission added. Read the entry, then review it against the rubric.'
                : `Submission v${next.entry.revision} saved. A fresh review and scorecard are ready.`,
            );
          }}
        />
      )}
    </div>
  );
}
