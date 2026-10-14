import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { Entry } from './types';

export default function SubmissionQueue({
  entries,
  selected,
  filter,
  onFilter,
  onSelect,
}: {
  entries: Entry[];
  selected: string;
  filter: string;
  onFilter: (value: string) => void;
  onSelect: (entry: Entry) => void;
}) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const reviewed = entries.filter((entry) => entry.status === 'reviewed').length;
  const visibleEntries = entries.filter(
    (entry) =>
      filter === 'all' ||
      (filter === 'reviewed' ? entry.status === 'reviewed' : entry.status !== 'reviewed'),
  );
  return (
    <aside className="queue panel" aria-label="Submission queue">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        className="queue-disclosure"
      >
        <summary>
          <span>
            Review queue <small>{entries.length}</small>
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="queue-content">
          <div className="queue-progress">
            <span>
              {reviewed} of {entries.length} reviewed
            </span>
          </div>
          <progress value={reviewed} max={entries.length} aria-label="Entries reviewed" />
          <label className="queue-filter">
            <span className="visually-hidden">Filter submissions</span>
            <select value={filter} onChange={(e) => onFilter(e.target.value)}>
              <option value="all">All submissions</option>
              <option value="pending">Needs review</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </label>
          <nav aria-label="Choose a submission">
            {visibleEntries.map((entry, index) => (
              <button
                type="button"
                key={entry.id}
                className={`queue-entry ${entry.id === selected ? 'selected' : ''}`}
                aria-current={entry.id === selected ? 'true' : undefined}
                onClick={() => onSelect(entry)}
              >
                <span className="queue-entry-number">{String(index + 1).padStart(2, '0')}</span>
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
            {visibleEntries.length === 0 && (
              <p className="empty-queue">
                No entries match this filter. Choose All submissions to see the full queue.
              </p>
            )}
          </nav>
        </div>
      </details>
    </aside>
  );
}
