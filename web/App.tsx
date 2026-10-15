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
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
} from 'lucide-react';
import EntryForm from './EntryForm';
import SubmissionQueue from './SubmissionQueue';
import SubmissionReader from './SubmissionReader';
import { formatDate } from './format';
import { focusPanelHeading } from './focus';
import ReviewProcess from './ReviewProcess';
import useSavedAction from './useSavedAction';
import useAnalysis from './useAnalysis';
import Walkthrough from './Walkthrough';
import Notice from './Notice';
import ConnectionPanel from './ConnectionPanel';
import { errorText } from './api';
import type { Citation, Entry } from './contracts';
import useWorkspace from './useWorkspace';

const tabs = [
  { id: 'submission', label: 'Read submission', Icon: FileText },
  { id: 'evidence', label: 'Review & score', Icon: Search },
  { id: 'decision', label: 'Recommendation', Icon: ClipboardCheck },
] as const;
type Tab = (typeof tabs)[number]['id'];
const headingIds: Record<Tab, string> = {
  submission: 'start-title',
  evidence: 'analysis-title',
  decision: 'scorecard-title',
};
export default function App() {
  const focusLoaded = useRef(false);
  const [loadedFocus, setLoadedFocus] = useState<{ id: string } | null>(null);
  const [tab, setTab] = useState<Tab>('submission');
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [filter, setFilter] = useState('all');
  const [queueExpanded, setQueueExpanded] = useState(
    () => !window.matchMedia('(max-width: 760px)').matches,
  );
  const [notice, setNotice] = useState<{ id: number; text: string; error?: boolean } | null>(null);
  const noticeId = useRef(0);
  const [tour, setTour] = useState(false);
  const openTour = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setTour(true);
  };
  const [form, setForm] = useState<'new' | 'revision' | null>(null);
  const [citation, setCitation] = useState<Citation | null>(null);
  const citationOrigin = useRef<HTMLElement | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const targetHeading = useRef<string | null>(null);
  const changeTab = (next: Tab, focusId?: string) => {
    targetHeading.current = focusId ?? null;
    setTab(next);
    setCitation(null);
    if (next !== 'submission') setQueueExpanded(false);
    if (window.matchMedia('(max-width: 760px)').matches) setSourceExpanded(next === 'submission');
  };
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    const frame = requestAnimationFrame(() => {
      focusPanelHeading(document.getElementById(targetHeading.current ?? headingIds[tab]));
      targetHeading.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  const feedback = useCallback((text: string) => setNotice({ id: ++noticeId.current, text }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const notifyError = (e: unknown) =>
    setNotice({ id: ++noticeId.current, text: errorText(e), error: true });
  const {
    workspace,
    detail,
    error: loadError,
    selected,
    select,
    reload,
    reloadVersion,
    refresh: refreshWorkspace,
    accept: acceptDetail,
  } = useWorkspace(() => {
    if (focusLoaded.current) {
      focusLoaded.current = false;
      setLoadedFocus({ id: headingIds[tabRef.current] });
    }
  });
  useEffect(() => {
    if (loadedFocus) focusPanelHeading(document.getElementById(loadedFocus.id));
  }, [loadedFocus]);
  useEffect(() => {
    if (citation) {
      const passage = document.getElementById(`passage-${citation.paragraphId}`);
      passage?.focus({ preventScroll: true });
      passage?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [citation]);
  const analysis = useAnalysis({
    onSaved: (next) => {
      acceptDetail(next);
      changeTab('evidence');
    },
    feedback,
    onError: notifyError,
    refresh: refreshWorkspace,
  });
  const { busy, cancel: cancelAnalysis } = analysis;
  const {
    run: withSavedDraft,
    pendingAction,
    registerDraft,
  } = useSavedAction({
    cancelAnalysis,
    feedback,
    onBlocked: (kind) => {
      if (kind === 'finalize') return;
      if (tab === 'submission') changeTab('evidence', 'draft-save-error');
      else
        requestAnimationFrame(() => {
          const panel = document.getElementById('draft-save-error');
          panel?.focus({ preventScroll: true });
          panel?.scrollIntoView({ block: 'nearest' });
        });
    },
  });
  const transitionPending = pendingAction !== null;
  const selectEntry = (entry: Entry) => {
    if (entry.id === selected) return;
    void withSavedDraft(() => {
      focusLoaded.current = true;
      select(entry.id);
      changeTab('submission');
      setCitation(null);
      window.scrollTo({ top: 0 });
    }, true);
  };
  const reloadEntry = (discard = false) => {
    const reloadSaved = () => {
      focusLoaded.current = true;
      reload();
      setCitation(null);
      feedback('Reloading the latest saved entry.');
    };
    if (discard) {
      if (window.confirm('Discard the unsaved changes and load the saved draft?')) {
        cancelAnalysis();
        reloadSaved();
      }
    } else void withSavedDraft(reloadSaved, true, 'reload');
  };
  const showCitation = (next: Citation, origin: HTMLButtonElement) => {
    citationOrigin.current = origin;
    setCitation({ ...next });
    setSourceExpanded(true);
  };
  const returnToFinding = () => {
    if (window.matchMedia('(max-width: 760px)').matches) setSourceExpanded(false);
    requestAnimationFrame(() => {
      const origin = citationOrigin.current;
      if (origin?.isConnected) {
        origin.focus({ preventScroll: true });
        origin.scrollIntoView({ block: 'center' });
      }
    });
  };
  const toggleQueue = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setQueueExpanded(!queueExpanded);
    if (!queueExpanded)
      requestAnimationFrame(() => {
        const filter = document.getElementById('queue-filter');
        filter?.focus({ preventScroll: true });
        filter?.scrollIntoView({ block: 'nearest' });
      });
  };
  const runAnalysis = () => {
    if (!detail || busy) return;
    void withSavedDraft(
      () => {
        setNotice(null);
        void analysis.run(detail);
      },
      false,
      'analysis',
    );
  };
  async function exportPacket() {
    if (!detail) return;
    await withSavedDraft(
      async () => {
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
            'Case packet exported with the rubric, submission versions, analyses, and your saved assessment.',
          );
        } catch (e) {
          notifyError(e);
        }
      },
      false,
      'export',
    );
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
            <p>
              {workspace?.sharedDemo && (
                <strong className="shared-demo">Shared example workspace. </strong>
              )}
              Check submission evidence, score the rubric, and record a recommendation.
            </p>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={!workspace || busy || transitionPending}
            onClick={() => {
              void withSavedDraft(() => setForm('new'), false, 'new');
            }}
          >
            {pendingAction === 'new' ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}
            {pendingAction === 'new' ? 'Saving changes...' : 'Add submission'}
          </button>
        </div>
        {loadError ? (
          <div className="loading-panel error-panel" role="alert">
            <h2>The workspace could not load.</h2>
            <p>{loadError}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                focusLoaded.current = true;
                reload();
              }}
            >
              <RefreshCw size={16} />
              Try again
            </button>
            {selected !== 'tidewell' && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  focusLoaded.current = true;
                  changeTab('submission');
                  select('tidewell');
                }}
              >
                Open example workspace
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        ) : !workspace || !detail ? (
          <ConnectionPanel initial={!workspace} />
        ) : (
          <div className={`workspace-layout ${queueExpanded ? '' : 'queue-collapsed'}`}>
            <SubmissionQueue
              entries={workspace.entries}
              selected={selected}
              filter={filter}
              onFilter={setFilter}
              onSelect={selectEntry}
              expanded={queueExpanded}
              pending={transitionPending}
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
                <div className="entry-actions">
                  {transitionPending && (
                    <p className="transition-status" role="status">
                      <LoaderCircle size={16} className="spin" />
                      {pendingAction === 'export'
                        ? 'Preparing export...'
                        : pendingAction === 'finalize'
                          ? 'Recording recommendation...'
                          : 'Saving changes before continuing...'}
                    </p>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    aria-expanded={queueExpanded}
                    aria-controls="submission-queue"
                    onClick={toggleQueue}
                  >
                    {queueExpanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
                    {queueExpanded ? 'Hide review queue' : 'Show review queue'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void exportPacket()}
                    disabled={transitionPending}
                  >
                    {pendingAction === 'export' ? (
                      <LoaderCircle size={19} className="spin" />
                    ) : (
                      <ArrowDownToLine size={19} />
                    )}
                    {pendingAction === 'export' ? 'Preparing export...' : 'Export case packet'}
                  </button>
                </div>
              </div>
              <nav className="review-tabs" aria-label="Review steps">
                {tabs.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={tab === item.id ? 'active' : ''}
                    aria-current={tab === item.id ? 'step' : undefined}
                    onClick={() => changeTab(item.id)}
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
                  onReturn={returnToFinding}
                  onRevise={() => {
                    void withSavedDraft(() => setForm('revision'), false, 'revision');
                  }}
                />
                <div className="case-controls">
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
                          <p>Check each quotation, then score that criterion.</p>
                        </div>
                      </li>
                      <li>
                        <span>3</span>
                        <div>
                          <strong>Record your judgment</strong>
                          <p>Check your scores and explain your decision.</p>
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
                  <ReviewProcess
                    key={`${detail.entry.id}-${detail.entry.revision}-${reloadVersion}`}
                    active={tab}
                    detail={detail}
                    criteria={workspace.competition.criteria}
                    analysisRunning={busy}
                    onSaved={acceptDetail}
                    onFeedback={feedback}
                    onRegister={registerDraft}
                    onReload={() => reloadEntry(true)}
                    transitionPending={transitionPending}
                    exporting={pendingAction === 'export'}
                    onFinalize={(action) => withSavedDraft(action, false, 'finalize')}
                    onExport={() => void exportPacket()}
                    onReview={(focusId) => changeTab('evidence', focusId)}
                    onRecommend={() => changeTab('decision')}
                    evidence={{
                      rubricVersion: workspace.competition.version,
                      ai: workspace.ai,
                      busy,
                      onCitation: showCitation,
                      onCriterionChange: () => setCitation(null),
                      onAnalyze: () => void runAnalysis(),
                      onCancel: cancelAnalysis,
                    }}
                  />
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
                  <button type="button" className="text-button" onClick={() => reloadEntry()}>
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
            if (next.entry.id === selected) {
              acceptDetail(next);
              setCitation(null);
              changeTab('submission');
            } else {
              select(next.entry.id);
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
