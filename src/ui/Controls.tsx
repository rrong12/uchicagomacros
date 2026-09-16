import { Icon } from "./Icon";
interface Props {
  periods: string[];
  period: string;
  onPeriodChange: (p: string) => void;
}
export function Controls({ periods, period, onPeriodChange }: Props) {
  return (
    <div className="controls">
      <div className="segmented" role="group" aria-label="Meal period">
        {periods.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === period}
            className={p === period ? "seg seg-on" : "seg"}
            onClick={() => onPeriodChange(p)}
          >
            <Icon
              name={
                /dinner|night/i.test(p)
                  ? "moon"
                  : /breakfast|brunch/i.test(p)
                    ? "sun"
                    : "utensils"
              }
            />
            {p}
          </button>
        ))}
      </div>
      <span className="portion-note">A little planning. A better plate.</span>
    </div>
  );
}
