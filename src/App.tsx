import { useState } from "react";
import { useMenus } from "./state/useMenus";
import { currentPeriodName } from "./domain/datetime";
import { HALLS } from "./domain/halls";
import { Controls } from "./ui/Controls";
import { HallCard } from "./ui/HallCard";
import { usePlate } from "./state/usePlate";
import { PlatePanel } from "./ui/PlatePanel";
import { Icon } from "./ui/Icon";
import "./index.css";

export default function App() {
  const { days, loading, error, date } = useMenus();
  const [period, setPeriod] = useState<string | null>(null);
  const [hallId, setHallId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const periods = [
    ...new Set(
      days
        .filter((d) => !d.closed)
        .flatMap((d) => d.periods.map((p) => p.name)),
    ),
  ];
  const activePeriod =
    period && periods.includes(period)
      ? period
      : periods.includes(currentPeriodName())
        ? currentPeriodName()
        : (periods[0] ?? "");
  const selected =
    days.find((d) => d.hall.id === hallId) ??
    days.find((d) => !d.closed) ??
    days[0];
  const selectedId = selected?.hall.id ?? HALLS[0].id;
  const plate = usePlate(
    JSON.stringify([selected?.date ?? date, selectedId, activePeriod]),
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <div className="app">
      <a className="skip-link" href="#menu">
        Skip to menu
      </a>
      <header className="hero">
        <div className="hero-inner">
          <div className="brand-row">
            <a
              className="brand"
              href={import.meta.env.BASE_URL}
              aria-label="UChicagoMacros home"
            >
              <span className="brand-mark">
                <Icon name="utensils" />
              </span>
              <span>
                UChicago<span className="brand-light">Macros</span>
              </span>
            </a>
            <span className="campus-label">THE COMMONS, AT A GLANCE</span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">A GOOD MEAL STARTS HERE</p>
            <h1>
              Find your next <em>favorite.</em>
            </h1>
            <p className="hero-description">
              Four dining halls. Every macro. One less thing to figure out.
            </p>
          </div>
          <svg
            className="campus-art"
            aria-hidden="true"
            viewBox="0 0 480 240"
            fill="none"
          >
            <g stroke="currentColor" strokeWidth="1.5">
              <path d="M8 229h464M30 229V135h116v94M24 135l64-27 64 27M62 229v-47q26-44 52 0v47M54 149h12v17H54zM112 149h12v17h-12zM156 229V77h72v152M150 77h84M167 77V54h50v23M177 54V34h30v20M186 34V15h12v19M174 112V94h12v18zM198 112V94h12v18zM179 151v-20q13-23 26 0v20zM179 222v-45q13-23 26 0v45M239 229V144h115v85M232 144l64-27 64 27M253 229v-39q12-21 24 0v39M290 229v-39q12-21 24 0v39M327 229v-39q9-21 18 0v39M365 229V101h83v128M359 101l47-32 49 32M380 129h12v21h-12zM420 129h12v21h-12zM390 229v-43q16-28 32 0v43" />
              <path d="M33 235h420M80 105V92m-6 6h12M406 67V48m-6 7h12" />
            </g>
          </svg>
          <div className="hero-bottom">
            <span className="date">
              <Icon name="calendar" />
              {dateLabel}
            </span>
            <span className="timezone">Menus for today · Chicago time</span>
          </div>
        </div>
      </header>

      <main className="main" id="menu">
        <div className="hall-picker" role="group" aria-label="Dining hall">
          {HALLS.map((hall, index) => {
            const day = days.find((d) => d.hall.id === hall.id);
            const selected = hall.id === selectedId;
            const state = loading
              ? "Loading menu"
              : !day
                ? "Unavailable"
                : day.closed
                  ? "Closed today"
                  : "Menus available";
            return (
              <button
                key={hall.id}
                type="button"
                className={`hall-option${selected ? " selected" : ""}`}
                aria-pressed={selected}
                onClick={() => setHallId(hall.id)}
                disabled={loading || !!error}
              >
                <span className="hall-option-top">
                  <span className="hall-number">0{index + 1}</span>
                  <Icon name={selected ? "check" : "arrow"} />
                </span>
                <span className="hall-option-name">{hall.name}</span>
                <span
                  className={`hall-availability${day && !day.closed && !error ? " available" : ""}`}
                >
                  <i aria-hidden="true" />
                  {state}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div role="status" className="loading-state">
            <p>Loading menus…</p>
            <div className="skeleton" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n} />
              ))}
            </div>
          </div>
        ) : error ? (
          <section className="empty-state" role="alert">
            <Icon name="utensils" />
            <h2>Menus are taking a break</h2>
            <p>{error}</p>
            <button
              className="text-button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <a
              href="https://dineoncampus.com/uchicago/whats-on-the-menu"
              target="_blank"
              rel="noreferrer"
            >
              Check the official menu ↗
            </a>
          </section>
        ) : (
          <>
            {periods.length > 0 && (
              <Controls
                periods={periods}
                period={activePeriod}
                onPeriodChange={setPeriod}
              />
            )}
            {selected && (
              <>
                <div className="menu-toolbar">
                  <div>
                    <p className="eyebrow menu-eyebrow">ON THE MENU</p>
                    <h2 className="menu-title">
                      {selected.hall.name}
                      <span> / {activePeriod || "Today"}</span>
                    </h2>
                  </div>
                  {!selected.closed && (
                    <div className="search-field">
                      <Icon name="search" />
                      <input
                        type="search"
                        aria-label="Search menu"
                        placeholder="Find a dish…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setQuery("")}
                        >
                          <Icon name="close" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!selected.closed && (
                  <PlatePanel
                    plate={plate}
                    hall={selected.hall.name}
                    period={activePeriod}
                    date={selected.date}
                  />
                )}
                <HallCard
                  day={selected}
                  period={activePeriod}
                  query={query}
                  onAdd={plate.add}
                />
              </>
            )}
            {!selected && (
              <section className="empty-state">
                <h2>No menus available</h2>
                <p>Check back later for today's dining hall menus.</p>
              </section>
            )}
          </>
        )}
        <footer className="footer">
          <div>
            <span className="footer-brand">UChicagoMacros</span>
            <p>Made for the walk to the dining hall.</p>
          </div>
          <div className="source-note">
            <a
              href="https://dineoncampus.com/uchicago/whats-on-the-menu"
              target="_blank"
              rel="noreferrer"
            >
              Menus from Dine On Campus ↗
            </a>
            <p>
              Nutrition is per listed portion. — means not reported.
              <br />
              Independent student project. Not affiliated with the University of
              Chicago.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
