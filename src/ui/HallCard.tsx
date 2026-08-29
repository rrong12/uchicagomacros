import type { HallDay, MenuItem } from "../domain/types";
import { menuFor } from "../domain/types";
import { sortItems } from "../domain/filter";
import { ItemRow } from "./ItemRow";

interface Props {
  day: HallDay;
  period: string;
  proteinFirst: boolean;
}

/** Group items by their menu category, preserving first-seen order. */
function byCategory(items: readonly MenuItem[]): Array<[string, MenuItem[]]> {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const existing = groups.get(item.category);
    if (existing) existing.push(item);
    else groups.set(item.category, [item]);
  }
  return [...groups];
}

/** The highest-protein item, for the at-a-glance summary. Null if none known. */
function topProtein(items: readonly MenuItem[]): MenuItem | null {
  let best: MenuItem | null = null;
  for (const item of items) {
    if (item.protein_g === null) continue;
    if (best === null || item.protein_g > best.protein_g!) best = item;
  }
  return best;
}

export function HallCard({ day, period, proteinFirst }: Props) {
  const menu = menuFor(day, period);

  if (!menu || menu.items.length === 0) {
    return (
      <section className="hall">
        <header className="hall-head">
          <h2>{day.hall.name}</h2>
        </header>
        <p className="hall-empty">No {period.toLowerCase()} listed</p>
      </section>
    );
  }

  const best = topProtein(menu.items);

  return (
    <section className="hall">
      <header className="hall-head">
        <h2>{day.hall.name}</h2>
        <span className="hall-count">{menu.items.length} items</span>
      </header>

      {best && (
        <p className="hall-best">
          Most protein: <strong>{best.name}</strong> at {best.protein_g}g
        </p>
      )}

      {proteinFirst ? (
        <ul className="items">
          {sortItems(menu.items, "protein_g", "desc").map((i) => (
            <ItemRow key={`${i.category}-${i.id}-${i.name}`} item={i} />
          ))}
        </ul>
      ) : (
        byCategory(menu.items).map(([category, items]) => (
          <div className="category" key={category}>
            <h3 className="category-name">{category}</h3>
            <ul className="items">
              {items.map((i) => (
                <ItemRow key={`${i.category}-${i.id}-${i.name}`} item={i} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
