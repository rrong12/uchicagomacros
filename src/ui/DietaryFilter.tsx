import type { MenuItem } from "../domain/types";

interface Props {
  items: readonly MenuItem[];
  selected: readonly string[];
  onToggle: (label: string) => void;
  onClear: () => void;
}

/**
 * Count each dietary label across the menu currently on screen.
 *
 * Derived from the items rather than a hardcoded list: a fixed set would offer
 * a Vegan chip on a day with no vegan dishes, and would silently miss any label
 * the dining hall starts publishing later.
 */
function labelCounts(items: readonly MenuItem[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const label of item.labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function DietaryFilter({ items, selected, onToggle, onClear }: Props) {
  const counts = labelCounts(items);
  if (counts.length === 0) return null;

  return (
    <div className="dietary-filter">
      <div className="dietary-heading">
        <p className="eyebrow">DIETARY LABELS</p>
        {selected.length > 0 && (
          <button type="button" className="text-button" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
      <div className="chip-row" role="group" aria-label="Dietary labels">
        {counts.map(([label, count]) => {
          const on = selected.includes(label);
          return (
            <button
              key={label}
              type="button"
              className={`chip${on ? " chip-on" : ""}`}
              aria-pressed={on}
              onClick={() => onToggle(label)}
            >
              {label}
              <span className="chip-count">{count}</span>
            </button>
          );
        })}
      </div>
      <p className="dietary-note">
        {selected.length > 1
          ? "Showing dishes with every selected label."
          : "Labels come from the dining hall, as published."}
      </p>
    </div>
  );
}
