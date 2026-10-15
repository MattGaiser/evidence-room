import { ArrowLeft } from 'lucide-react';
import { outcomeLabels, scoreLabels } from './assessment';
import { outcomeSchema } from './contracts';
import type { Criterion } from './contracts';
import type { Draft } from './useAutosave';

export default function RecommendationFields({
  criteria,
  draft,
  disabled,
  showValidation,
  onChange,
  onEdit,
}: {
  criteria: Criterion[];
  draft: Draft;
  disabled: boolean;
  showValidation: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onEdit: (id: string) => void;
}) {
  const { scores, rationale, outcome, confirmed } = draft;
  const missingScores = criteria.filter((c) => scores[c.id] === null);
  const rationaleMissing = rationale.trim().length < 40;
  return (
    <>
      <ul className="score-summary" aria-label="Your criterion scores">
        {criteria.map((criterion) => (
          <li
            key={criterion.id}
            data-missing={showValidation && scores[criterion.id] === null ? 'true' : undefined}
          >
            <div>
              <strong>{criterion.name}</strong>
              <small>{criterion.weight}% of total</small>
            </div>
            <span>
              {scores[criterion.id] === null
                ? 'Not scored'
                : `${scores[criterion.id]} / 4: ${scoreLabels[scores[criterion.id] ?? 0]}`}
            </span>
            <button
              type="button"
              className="text-button"
              aria-label={`Edit ${criterion.name} score`}
              onClick={() => onEdit(criterion.id)}
            >
              Edit score
              <ArrowLeft size={14} />
            </button>
          </li>
        ))}
      </ul>
      {missingScores.length > 0 && (
        <div className="missing-scores">
          <p>
            {missingScores.length}{' '}
            {missingScores.length === 1
              ? 'criterion still needs a score'
              : 'criteria still need scores'}
            .
          </p>
          <button type="button" className="text-button" onClick={() => onEdit(missingScores[0].id)}>
            Complete missing scores
            <ArrowLeft size={16} />
          </button>
        </div>
      )}
      <label className={`field ${showValidation && rationaleMissing ? 'invalid-field' : ''}`}>
        <span>Your rationale</span>
        <textarea
          id="assessment-rationale"
          aria-invalid={(showValidation && rationaleMissing) || undefined}
          disabled={disabled}
          rows={4}
          maxLength={4000}
          value={rationale}
          onChange={(e) => {
            onChange({ rationale: e.target.value });
          }}
          placeholder="Explain how the evidence and its limitations support your recommendation."
          aria-describedby={
            showValidation && rationaleMissing
              ? 'rationale-help requirement-rationale'
              : 'rationale-help'
          }
        />
      </label>
      <p id="rationale-help" className="field-help">
        At least 40 characters to finalize.
      </p>
      <div className={`field ${showValidation && outcome === '' ? 'invalid-field' : ''}`}>
        <label htmlFor="recommendation">Recommendation</label>
        <select
          disabled={disabled}
          id="recommendation"
          aria-invalid={(showValidation && outcome === '') || undefined}
          aria-describedby={showValidation && outcome === '' ? 'requirement-outcome' : undefined}
          value={outcome}
          onChange={(e) => {
            onChange({ outcome: outcomeSchema.parse(e.target.value) });
          }}
        >
          <option value="">Choose a recommendation</option>
          {Object.entries(outcomeLabels).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label className={`confirmation ${showValidation && !confirmed ? 'invalid-field' : ''}`}>
        <input
          type="checkbox"
          id="independent-review"
          aria-invalid={(showValidation && !confirmed) || undefined}
          aria-describedby={showValidation && !confirmed ? 'requirement-confirmation' : undefined}
          disabled={disabled}
          checked={confirmed}
          onChange={(e) => {
            onChange({ confirmed: e.target.checked });
          }}
        />
        <span>I checked the submission and made an independent assessment.</span>
      </label>
    </>
  );
}
