import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import EntryForm from './EntryForm';
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
const coverage = {
  documented: 'Evidence described',
  partial: 'Needs detail',
  missing: 'Not provided',
};

function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

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
  const feedback = useCallback((text: string) => setNotice({ id: ++noticeId.current, text }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const notifyError = (e: unknown) =>
    setNotice({ id: ++noticeId.current, text: errorText(e), error: true });
  const refreshWorkspace = useCallback(async () => {
    const value = await api<Workspace>('/api/workspace');
    setWorkspace(value);
    return value;
  }, []);
  useEffect(() => {
    void reload;
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
          setWorkspace(ws);
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
    if (window.matchMedia('(max-width: 760px)').matches) setSourceExpanded(tab === 'submission');
  }, [tab]);
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
    setTab('submission');
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
        'AI analysis saved. Every cited quotation passed the source check. Review each finding before scoring.',
      );
      setTab('evidence');
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
  const entries =
    workspace?.entries.filter(
      (e) =>
        filter === 'all' ||
        (filter === 'reviewed' ? e.status === 'reviewed' : e.status !== 'reviewed'),
    ) ?? [];
  const reviewed = workspace?.entries.filter((e) => e.status === 'reviewed').length ?? 0;
  const review = detail?.review;
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
        <span className="workspace-label">Competition review</span>
        <div className="header-actions">
          <span className="sample-label">Sample workspace</span>
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
            <p className="eyebrow">
              {workspace?.competition.round ?? 'Submission review'} · Round 01
            </p>
            <h1>{workspace?.competition.name ?? 'Evidence Room'}</h1>
            <p>Review what the team demonstrates. Record what you recommend.</p>
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
            <aside className="queue panel" aria-label="Submission queue">
              <details
                open={!window.matchMedia('(max-width: 760px)').matches}
                className="queue-disclosure"
              >
                <summary>
                  <span>
                    Review queue <small>{workspace.entries.length}</small>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <div className="queue-content">
                  <div className="queue-progress">
                    <span>
                      {reviewed} of {workspace.entries.length} reviewed
                    </span>
                    <span>{Math.round((reviewed / workspace.entries.length) * 100)}%</span>
                  </div>
                  <progress
                    value={reviewed}
                    max={workspace.entries.length}
                    aria-label="Entries reviewed"
                  />
                  <label className="queue-filter">
                    <span className="visually-hidden">Filter submissions</span>
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                      <option value="all">All submissions</option>
                      <option value="pending">Needs review</option>
                      <option value="reviewed">Reviewed</option>
                    </select>
                  </label>
                  <nav aria-label="Choose a submission">
                    {entries.map((entry, index) => (
                      <button
                        type="button"
                        key={entry.id}
                        className={`queue-entry ${entry.id === selected ? 'selected' : ''}`}
                        aria-current={entry.id === selected ? 'true' : undefined}
                        onClick={() => selectEntry(entry)}
                      >
                        <span className="queue-entry-number">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>
                          <strong>{entry.team}</strong>
                          <span className="queue-entry-title">{entry.title}</span>
                          <span className={`entry-status ${entry.status}`}>
                            {entry.status === 'reviewed' ? <Check size={12} /> : <i />}
                            {entry.status === 'reviewed'
                              ? 'Reviewed'
                              : entry.status === 'draft'
                                ? 'Draft scorecard'
                                : 'Ready to review'}
                          </span>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {entries.length === 0 && (
                      <p className="empty-queue">
                        No entries match this filter. Choose All submissions to see the full queue.
                      </p>
                    )}
                  </nav>
                  <div className="queue-foot">
                    <BookOpen size={17} />
                    <p>
                      First time here? Start with Tidewell, then compare the two alternative
                      approaches.
                    </p>
                    <button type="button" className="text-button" onClick={openTour}>
                      Walk me through it
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </details>
            </aside>
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
                      setTab(item.id);
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
                <section
                  className={`submission panel ${!sourceExpanded ? 'source-collapsed' : ''}`}
                  aria-labelledby="source-title"
                >
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Original submission</p>
                      <h3 id="source-title">The team’s case</h3>
                    </div>
                    <span className="version-chip">v{detail.entry.revision}</span>
                  </div>
                  <button
                    type="button"
                    className="mobile-source-toggle text-button"
                    aria-expanded={sourceExpanded}
                    onClick={() => setSourceExpanded((value) => !value)}
                  >
                    {sourceExpanded ? 'Collapse source passages' : 'Show source passages'}
                    <ChevronDown size={16} />
                  </button>
                  <div className="source-content">
                    <div className="source-intro">
                      <FileText size={16} />
                      <span>
                        {detail.submission.paragraphs.length} passages ·{' '}
                        {detail.submission.paragraphs.reduce(
                          (n, p) => n + p.text.split(/\s+/).length,
                          0,
                        )}{' '}
                        words
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (canLeave()) setForm('revision');
                        }}
                      >
                        Submit revision
                      </button>
                    </div>
                    {detail.submission.paragraphs.map((paragraph, index) => {
                      const match =
                        citation?.paragraphId === paragraph.id
                          ? paragraph.text.indexOf(citation.quote)
                          : -1;
                      return (
                        <article
                          key={paragraph.id}
                          id={`passage-${paragraph.id}`}
                          className={`passage ${match >= 0 ? 'cited' : ''}`}
                          tabIndex={-1}
                        >
                          <span className="passage-number">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <p>
                            {match >= 0 && citation ? (
                              <>
                                {paragraph.text.slice(0, match)}
                                <mark>{citation.quote}</mark>
                                {paragraph.text.slice(match + citation.quote.length)}
                              </>
                            ) : (
                              paragraph.text
                            )}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <div className="case-controls">
                  <section
                    hidden={tab !== 'submission'}
                    className="panel start-review"
                    aria-labelledby="start-title"
                  >
                    <span className="round-icon">
                      <ShieldCheck size={26} />
                    </span>
                    <p className="eyebrow">A focused review</p>
                    <h3 id="start-title">
                      Read it. Check it.
                      <br />
                      Make the call.
                    </h3>
                    <p>
                      Use four criteria to decide whether the evidence supports a supervised pilot,
                      or whether the team needs to clarify its case.
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
                      onClick={() => setTab('evidence')}
                    >
                      Review the evidence
                      <ArrowRight size={16} />
                    </button>
                    <p className="example-caption">Fictional entries and an illustrative rubric.</p>
                  </section>
                  <section
                    hidden={tab !== 'evidence'}
                    className="panel analysis"
                    aria-labelledby="analysis-title"
                  >
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Rubric v{workspace.competition.version}</p>
                        <h3 id="analysis-title">Evidence, criterion by criterion</h3>
                      </div>
                      <Sparkles size={21} />
                    </div>
                    {review ? (
                      <>
                        <div className="analysis-summary">
                          <span
                            className={`analysis-source ${review.source === 'example' ? 'example' : ''}`}
                          >
                            {review.source === 'example' ? 'Example analysis' : 'AI analysis'}
                            <span>Submission v{review.submissionRevision}</span>
                          </span>
                          <p>{review.content.summary}</p>
                        </div>
                        <div className="findings">
                          {workspace.competition.criteria.map((criterion) => {
                            const finding = review.content.criteria.find(
                              (f) => f.criterionId === criterion.id,
                            );
                            if (!finding) return null;
                            return (
                              <details className="finding" key={criterion.id} open>
                                <summary>
                                  <span>{criterion.name}</span>
                                  <span className={`coverage ${finding.status}`}>
                                    {coverage[finding.status]}
                                  </span>
                                  <ChevronDown size={15} />
                                </summary>
                                <div className="finding-content">
                                  <p>{finding.finding}</p>
                                  {finding.evidence.map((cite) => (
                                    <button
                                      type="button"
                                      className="evidence-quote"
                                      key={cite.paragraphId + cite.quote}
                                      onClick={() => showCitation(cite)}
                                    >
                                      <span>“{cite.quote}”</span>
                                      <small>
                                        Passage {cite.paragraphId.slice(1)}
                                        <ArrowLeft size={13} />
                                      </small>
                                    </button>
                                  ))}
                                  {finding.question && (
                                    <div className="clarification">
                                      <strong>Ask the team</strong>
                                      <p>{finding.question}</p>
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                        {review.content.flags.length > 0 && (
                          <div className="review-flags">
                            <h4>Items for attention</h4>
                            {review.content.flags.map((flag) => (
                              <div key={flag.paragraphId + flag.quote}>
                                <p>{flag.message}</p>
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    showCitation({
                                      paragraphId: flag.paragraphId,
                                      quote: flag.quote,
                                    })
                                  }
                                >
                                  View flagged passage
                                  <ArrowLeft size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <details className="analysis-provenance">
                          <summary>Analysis details</summary>
                          <dl>
                            <div>
                              <dt>Source</dt>
                              <dd>
                                {review.source === 'example'
                                  ? 'Authored illustration'
                                  : review.model}
                              </dd>
                            </div>
                            <div>
                              <dt>Prompt</dt>
                              <dd>{review.promptVersion}</dd>
                            </div>
                            <div>
                              <dt>Saved</dt>
                              <dd>{date(review.createdAt)}</dd>
                            </div>
                          </dl>
                        </details>
                      </>
                    ) : (
                      <div className="empty-analysis">
                        <Search size={32} />
                        <h4>No analysis for this version yet.</h4>
                        <p>
                          Run an AI analysis to map the submission to the rubric. You can also read
                          the original and score it manually.
                        </p>
                      </div>
                    )}
                    <div className="analysis-actions">
                      {busy ? (
                        <>
                          <p role="status">
                            <LoaderCircle size={16} className="spin" />
                            Reading the rubric and checking source passages…
                          </p>
                          <button
                            type="button"
                            className="button secondary full"
                            onClick={cancelAnalysis}
                          >
                            Cancel analysis
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="button secondary full"
                            disabled={
                              !workspace.ai.available ||
                              workspace.ai.remaining === 0 ||
                              detail.assessment?.finalized
                            }
                            onClick={() => void runAnalysis()}
                          >
                            <Sparkles size={16} />
                            {review?.source === 'openai'
                              ? 'Run a new AI analysis'
                              : 'Run AI analysis'}
                          </button>
                          <p className="field-help">
                            {detail.assessment?.finalized
                              ? 'The final recommendation is locked. A submission revision starts a fresh review.'
                              : !workspace.ai.available
                                ? 'Live AI is not configured. Example analyses and independent scoring still work.'
                                : workspace.ai.remaining === 0
                                  ? 'The configured AI allowance has been used. Manual review remains available.'
                                  : 'Sends this submission and rubric to OpenAI. A new analysis leaves your scores unchanged.'}
                          </p>
                        </>
                      )}
                      <button
                        type="button"
                        className="button primary full"
                        onClick={() => setTab('decision')}
                      >
                        Continue to your assessment
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </section>
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
                            {date(event.createdAt)} · Submission v{event.revision}
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
        <footer className="page-footer">
          <span>Evidence Room · An independent product work sample</span>
          <button type="button" className="text-button" onClick={openTour}>
            About this workflow
            <ArrowRight size={14} />
          </button>
        </footer>
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
              setTab('submission');
            } else {
              setSelected(next.entry.id);
              setTab('submission');
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
