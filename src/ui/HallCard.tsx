import type { HallDay } from "../domain/types";
import type { SortField, SortDirection } from "../domain/filter";
import { sortItems } from "../domain/filter";
import { ItemRow } from "./ItemRow";

interface Props {
  day: HallDay;
  sortField: SortField;
  sortDirection: SortDirection;
}

export function HallCard({ day, sortField, sortDirection }: Props) {
  if (day.closed) {
    return (
      <section className="hall hall-closed">
        <h2>{day.hall.name}</h2>
        <p className="closed-note">Closed today</p>
      </section>
    );
  }

  const items = day.currentPeriod
    ? sortItems(day.currentPeriod.items, sortField, sortDirection)
    : [];

  return (
    <section className="hall">
      <h2>
        {day.hall.name}
        {day.currentPeriod && (
          <span className="period">{day.currentPeriod.name}</span>
        )}
      </h2>
      {items.length === 0 ? (
        <p className="closed-note">No items listed</p>
      ) : (
        <ul className="items">
          {items.map((i) => (
            <ItemRow key={`${i.category}-${i.id}-${i.name}`} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
