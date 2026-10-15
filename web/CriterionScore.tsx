import { scoreLabels } from './assessment';
import type { Criterion } from './types';

export default function CriterionScore({
  criterion,
  score,
  disabled,
  invalid,
  finalized,
  onScore,
}: {
  criterion: Criterion;
  score: number | null;
  disabled: boolean;
  invalid: boolean;
  finalized: boolean;
  onScore: (score: number) => void;
}) {
  return (
    <section
      className={`criterion-score ${invalid ? 'invalid-field' : ''}`}
      aria-labelledby="criterion-score-title"
    >
      <div className="criterion-score-heading">
        <h4 id="criterion-score-title" tabIndex={-1}>
          Your score for {criterion.name}
        </h4>
        <span>{criterion.weight}% of total</span>
      </div>
      <p className="criterion-description">{criterion.description}</p>
      {finalized ? (
        <p className="selected-score">
          Recorded score: {score} of 4 — {scoreLabels[score ?? 0]}
        </p>
      ) : (
        <>
          <fieldset
            className="score-options"
            aria-invalid={invalid || undefined}
            aria-describedby="current-score-help"
          >
            <legend className="visually-hidden">{criterion.name} score</legend>
            {scoreLabels.map((label, value) => (
              <label key={label} className={score === value ? 'selected' : ''}>
                <input
                  type="radio"
                  disabled={disabled}
                  name={`score-${criterion.id}`}
                  value={value}
                  checked={score === value}
                  onChange={() => onScore(value)}
                />
                <span aria-hidden="true">{value}</span>
                <span className="visually-hidden">
                  {value} — {label}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="selected-score" id="current-score-help" role="status">
            {score === null
              ? 'Choose a score from 0 to 4, then continue to the next criterion.'
              : `${score} of 4 — ${scoreLabels[score]}`}
          </p>
        </>
      )}
      <details className="scale-guide">
        <summary>How the 0–4 scale works</summary>
        <ol start={0}>
          {scoreLabels.map((label, index) => (
            <li key={label}>
              <strong>{index}</strong>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <p>Use the same evidence standard for every submission.</p>
      </details>
    </section>
  );
}
