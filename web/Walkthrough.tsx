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
    title: 'Start with the team’s actual submission.',
    body: 'Read the original passages before you assess the idea. Each passage has a stable reference within its submission version.',
    detail:
      'The Tidewell example has a measured bench trial, an incomplete cost estimate, and open questions about field delivery. Start there to try the full workflow.',
    Icon: BookOpen,
    label: '01 / Read the submission',
  },
  {
    title: 'Follow the evidence, one criterion at a time.',
    body: 'The analysis connects each finding to a verbatim passage. Select a quotation to reveal it in the original submission, then decide whether the interpretation holds.',
    detail:
      '“Evidence described” means the application covers the criterion. It does not mean an external test result has been verified. Missing information becomes a question for the team.',
    Icon: Quote,
    label: '02 / Check the evidence',
  },
  {
    title: 'Make an independent recommendation.',
    body: 'Choose a score for each criterion, explain your reasoning, and recommend a pilot, clarification, or further development. AI never enters the numeric scores.',
    detail:
      'Save an unfinished scorecard as a draft. Finalizing requires a complete scorecard and your confirmation; it records a recommendation rather than selecting a prize winner.',
    Icon: ListChecks,
    label: '03 / Make the call',
  },
  {
    title: 'Leave a review that someone can follow.',
    body: 'Export the case packet with its rubric, submission versions, analyses, recommendation, and event history. A new submission version starts a fresh review.',
    detail:
      'The three applications are fictional examples. Their authored analyses work without AI; “Run AI analysis” sends the selected narrative and rubric to the configured provider.',
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
