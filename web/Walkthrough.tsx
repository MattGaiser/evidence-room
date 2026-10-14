import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileCheck2,
  ListChecks,
  Quote,
  SearchCheck,
} from 'lucide-react';
import Dialog from './Dialog';
const cards = [
  {
    title: 'Start with the submission.',
    body: 'Read what the team measured, estimated, and left unanswered. The original narrative stays beside the evidence review.',
    detail:
      'Tidewell reports a bench trial but leaves cost and field delivery questions open. Follow those gaps into the evidence review.',
    Icon: BookOpen,
    label: '01 / Read the submission',
  },
  {
    title: 'Follow the evidence, one criterion at a time.',
    body: 'The analysis connects each finding to a verbatim passage. Select a quotation to reveal it in the original submission, then choose your score for that criterion while the evidence is visible.',
    detail:
      'The queue hides while you review; Show review queue brings it back. Select a quotation to highlight its source, then use Back to finding to continue.',
    Icon: Quote,
    label: '02 / Check the evidence',
  },
  {
    title: 'Make an independent recommendation.',
    body: 'Check the scores you entered during review, explain your reasoning, and recommend a pilot, clarification, or further development.',
    detail:
      'Edit score returns to the relevant evidence without losing your rationale. Changes save automatically as you work. Finalize when all scores and your recommendation are complete.',
    Icon: ListChecks,
    label: '03 / Make the call',
  },
  {
    title: 'Export the complete case.',
    body: 'Export the case packet with its rubric, submission versions, analyses, recommendation, and event history. A new submission version starts a fresh review.',
    detail:
      'Use Submit revision when a team updates its narrative. Earlier submissions and recommendations remain in the case packet.',
    Icon: FileCheck2,
    label: '04 / Keep the record',
  },
];
export default function Walkthrough({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    void step;
    heading.current?.focus();
  }, [step]);
  const card = cards[step];
  return (
    <Dialog title="A quick walk through the review" onClose={onClose} className="tour-dialog">
      <div className="tour-art" aria-hidden="true">
        <card.Icon size={66} strokeWidth={1.2} />
        <div className="tour-art-lines">
          <span />
          <span />
          <span />
        </div>
        <SearchCheck className="tour-art-check" size={38} />
      </div>
      <div className="tour-copy">
        <p className="eyebrow">{card.label}</p>
        <h3 ref={heading} tabIndex={-1}>
          {card.title}
        </h3>
        <p>{card.body}</p>
        <p className="muted">{card.detail}</p>
      </div>
      <nav className="tour-actions" aria-label="Walkthrough cards">
        <button
          type="button"
          className="text-button"
          onClick={step ? () => setStep(step - 1) : onClose}
        >
          {step ? <ArrowLeft size={16} /> : null}
          {step ? 'Back' : 'Skip tour'}
        </button>
        <span className="tour-dots" role="img" aria-label={`Card ${step + 1} of 4`}>
          {cards.map((c, index) => (
            <i key={c.title} className={index === step ? 'active' : ''} />
          ))}
        </span>
        <button
          type="button"
          className="button primary"
          onClick={step === 3 ? onClose : () => setStep(step + 1)}
        >
          {step === 3 ? 'Start reviewing' : 'Next'}
          <ArrowRight size={16} />
        </button>
      </nav>
    </Dialog>
  );
}
