import { useState } from "react";
import type { MenuItem } from "../domain/types";
import {
  DEFAULT_CONSTRAINTS,
  suggestPlate,
  type SuggestedPlate,
} from "../domain/plate";
import { TARGET_FIELDS, useTargets } from "../state/useTargets";

interface Props {
  items: readonly MenuItem[];
  /** True when the plate already holds dishes, so accepting would overwrite. */
  plateHasItems: boolean;
  onAccept: (plate: SuggestedPlate) => void;
}

const SHORTFALL_MESSAGE = {
  "no-complete-items":
    "No dish on this menu reports a full set of macros, so there is nothing to build a suggestion from.",
  "targets-unreachable":
    "Nothing on this menu gets closer to these targets than an empty plate. Try raising them.",
} as const;

export function TargetForm({ items, plateHasItems, onAccept }: Props) {
  const { targets, set } = useTargets();
  const [suggestion, setSuggestion] = useState<SuggestedPlate | null>(null);
  const [confirming, setConfirming] = useState(false);

  const usable = items.filter((i) => i.macrosComplete).length;

  function suggest() {
    setSuggestion(suggestPlate(items, targets));
    setConfirming(false);
  }

  function accept(plate: SuggestedPlate) {
    onAccept(plate);
    setSuggestion(null);
    setConfirming(false);
  }

  return (
    <div className="target-form">
      <div className="target-heading">
        <div>
          <p className="eyebrow">HIT YOUR MACROS</p>
          <h3>Suggest a plate</h3>
        </div>
        <span className="target-count">
          {usable} of {items.length} dishes have full nutrition
        </span>
      </div>

      <div className="target-inputs">
        {TARGET_FIELDS.map(([key, label, unit, max]) => (
          <div key={key}>
            <label htmlFor={`target-${key}`}>
              {label} <span>({unit})</span>
            </label>
            <input
              id={`target-${key}`}
              type="number"
              min={0}
              max={max}
              step={key === "calories" ? 50 : 5}
              value={targets[key]}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!Number.isFinite(value)) return;
                set(key, Math.max(0, Math.min(max, value)));
                // The showing suggestion was built for the old targets.
                setSuggestion(null);
              }}
            />
          </div>
        ))}
      </div>

      <div className="target-actions">
        <button type="button" className="suggest-button" onClick={suggest}>
          Suggest a plate
        </button>
        <p className="plate-note">
          Whole servings only, up to {DEFAULT_CONSTRAINTS.maxItems} across the
          plate and {DEFAULT_CONSTRAINTS.maxPerItem} of any one dish. Dishes
          missing nutrition data are left out.
        </p>
      </div>

      {suggestion && (
        <div className="suggestion" aria-live="polite">
          {suggestion.selections.length === 0 ? (
            <p className="suggestion-empty">
              {suggestion.shortfall
                ? SHORTFALL_MESSAGE[suggestion.shortfall]
                : "No suggestion available for these targets."}
            </p>
          ) : (
            <>
              <p className="suggestion-summary">
                <strong>
                  {Number(suggestion.totals.calories.toFixed(1))} kcal ·{" "}
                  {Number(suggestion.totals.protein_g.toFixed(1))} g protein ·{" "}
                  {Number(suggestion.totals.carbs_g.toFixed(1))} g carbs ·{" "}
                  {Number(suggestion.totals.fat_g.toFixed(1))} g fat
                </strong>
                <span>
                  {Math.round(suggestion.deviation * 100)}% average distance
                  from your targets
                </span>
              </p>
              <ul className="suggestion-items">
                {suggestion.selections.map(({ item, servings }) => (
                  <li key={`${item.id}:${item.name}`}>
                    <span>
                      {servings}× {item.name}
                    </span>
                    <span>{item.category}</span>
                  </li>
                ))}
              </ul>
              {suggestion.shortfall === "targets-unreachable" && (
                <p className="plate-note">
                  This menu could not meet the {DEFAULT_CONSTRAINTS.minCategories}
                  -station minimum, so the suggestion draws on fewer stations.
                </p>
              )}
              {confirming ? (
                <div className="suggestion-confirm" role="alert">
                  <p>
                    This replaces the dishes already on your plate. That cannot
                    be undone.
                  </p>
                  <button
                    type="button"
                    className="suggest-button"
                    onClick={() => accept(suggestion)}
                  >
                    Replace my plate
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setConfirming(false)}
                  >
                    Keep what I have
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="suggest-button"
                  onClick={() =>
                    plateHasItems ? setConfirming(true) : accept(suggestion)
                  }
                >
                  Use this plate
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
