import { useMemo, useState } from "react";
import { useMenus } from "./state/useMenus";
import { currentPeriodName, displayDate } from "./domain/datetime";
import { Controls } from "./ui/Controls";
import { HallCard } from "./ui/HallCard";
import "./index.css";

export default function App() {
  const { days, loading, error } = useMenus();
  const [period, setPeriod] = useState<string | null>(null);
  const [proteinFirst, setProteinFirst] = useState(false);

  const open = days.filter((d) => !d.closed);
  const closed = days.filter((d) => d.closed);

  // Every period any open hall offers, in the API's own order.
  const periods = useMemo(() => {
    const seen: string[] = [];
    for (const day of open) {
      for (const p of day.periods) {
        if (!seen.includes(p.name)) seen.push(p.name);
      }
    }
    return seen;
  }, [open]);

  // Default to the meal being served now; fall back to whatever exists.
  const active =
    period && periods.includes(period)
      ? period
      : periods.includes(currentPeriodName())
        ? currentPeriodName()
        : (periods[0] ?? "");

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          UChicago<span>Macros</span>
        </h1>
        <p className="date">{displayDate()}</p>
      </header>

      {loading && (
        <div className="skeleton" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      )}

      {error && <p className="status status-error">{error}</p>}

      {!loading && !error && periods.length > 0 && (
        <Controls
          periods={periods}
          period={active}
          onPeriodChange={setPeriod}
          proteinFirst={proteinFirst}
          onProteinFirstToggle={() => setProteinFirst((v) => !v)}
        />
      )}

      {!loading && !error && open.length === 0 && (
        <p className="status">Every dining hall is closed today.</p>
      )}

      {open.map((day) => (
        <HallCard
          key={day.hall.id}
          day={day}
          period={active}
          proteinFirst={proteinFirst}
        />
      ))}

      {closed.length > 0 && (
        <p className="closed-line">
          Closed today: {closed.map((d) => d.hall.name).join(", ")}
        </p>
      )}
    </div>
  );
}
