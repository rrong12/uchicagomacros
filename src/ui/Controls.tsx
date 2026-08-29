interface Props {
  periods: string[];
  period: string;
  onPeriodChange: (p: string) => void;
  proteinFirst: boolean;
  onProteinFirstToggle: () => void;
}

export function Controls({
  periods,
  period,
  onPeriodChange,
  proteinFirst,
  onProteinFirstToggle,
}: Props) {
  return (
    <div className="controls">
      <div className="segmented" role="tablist" aria-label="Meal period">
        {periods.map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === period}
            className={p === period ? "seg seg-on" : "seg"}
            onClick={() => onPeriodChange(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <button
        className={proteinFirst ? "toggle toggle-on" : "toggle"}
        aria-pressed={proteinFirst}
        onClick={onProteinFirstToggle}
      >
        High protein first
      </button>
    </div>
  );
}
