import { useState } from "react";
import { useMenus } from "./state/useMenus";
import { FilterBar } from "./ui/FilterBar";
import { HallCard } from "./ui/HallCard";
import type { SortField, SortDirection } from "./domain/filter";
import "./index.css";

export default function App() {
  const { days, loading, error, date } = useMenus();
  const [sortField, setSortField] = useState<SortField>("protein_g");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  return (
    <main className="app">
      <header>
        <h1>UChicagoMacros</h1>
        <p className="date">{date}</p>
      </header>

      <FilterBar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onSortDirectionToggle={() =>
          setSortDirection((d) => (d === "desc" ? "asc" : "desc"))
        }
      />

      {loading && <p className="status">Loading menus…</p>}
      {error && <p className="status status-error">{error}</p>}

      {days.map((day) => (
        <HallCard
          key={day.hall.id}
          day={day}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      ))}
    </main>
  );
}
