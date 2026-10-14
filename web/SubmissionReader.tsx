import { ArrowRight, ChevronDown } from 'lucide-react';
import type { Citation, Detail } from './types';

export default function SubmissionReader({
  detail,
  citation,
  expanded,
  disabled,
  onToggle,
  onRevise,
  onReturn,
}: {
  detail: Detail;
  citation: Citation | null;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRevise: () => void;
  onReturn: () => void;
}) {
  return (
    <section
      className={`submission panel ${!expanded ? 'source-collapsed' : ''}`}
      aria-labelledby="source-title"
    >
      <div className="panel-heading">
        <div>
          <h3 id="source-title">Submission text</h3>
        </div>
        <div className="source-actions">
          <span className="version-chip">v{detail.entry.revision}</span>
          <button type="button" className="text-button" disabled={disabled} onClick={onRevise}>
            Submit revision
          </button>
        </div>
      </div>
      <button
        type="button"
        className="mobile-source-toggle text-button"
        aria-expanded={expanded}
        aria-controls="source-passages"
        onClick={onToggle}
      >
        {expanded ? 'Collapse source passages' : 'Show source passages'}
        <ChevronDown size={16} />
      </button>
      <div className="source-content" id="source-passages">
        {detail.submission.paragraphs.map((paragraph, index) => {
          const match =
            citation?.paragraphId === paragraph.id ? paragraph.text.indexOf(citation.quote) : -1;
          return (
            <article
              key={paragraph.id}
              id={`passage-${paragraph.id}`}
              className={`passage ${match >= 0 ? 'cited' : ''}`}
              tabIndex={-1}
            >
              <span className="passage-number">{String(index + 1).padStart(2, '0')}</span>
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
              {match >= 0 && (
                <button type="button" className="text-button return-to-finding" onClick={onReturn}>
                  Back to finding <ArrowRight size={15} />
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
