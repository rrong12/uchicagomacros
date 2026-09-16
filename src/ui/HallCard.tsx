import type { HallDay, MenuItem } from "../domain/types";
import { menuFor } from "../domain/types";
import { ItemRow } from "./ItemRow";
import { Icon } from "./Icon";
interface Props {
  day: HallDay;
  period: string;
  query?: string;
}
function byCategory(items: readonly MenuItem[]): Array<[string, MenuItem[]]> {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const key = item.category || "Menu";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return [...groups];
}
export function HallCard({ day, period, query = "" }: Props) {
  const menu = menuFor(day, period);
  let title = "",
    message = "";
  if (day.closed) {
    title = "Closed today";
    message = `${day.hall.name} has no service listed for today. Try another dining hall.`;
  } else if (!menu) {
    title = "Menu unavailable";
    message = day.periods.some((p) => p.name === period)
      ? `We couldn't load the ${period.toLowerCase()} menu. Try refreshing, or check the official menu.`
      : `No ${period.toLowerCase()} listed for ${day.hall.name}. Choose another meal or dining hall.`;
  } else if (!menu.items.length) {
    title = "Nothing listed yet";
    message = "This meal's menu is empty. Check back later.";
  }
  if (title)
    return (
      <section className="empty-state">
        <Icon name="utensils" />
        <h2>{title}</h2>
        <p>{message}</p>
      </section>
    );
  const term = query.trim().toLocaleLowerCase();
  const items = menu!.items.filter(
    (i) =>
      !term || `${i.name} ${i.category}`.toLocaleLowerCase().includes(term),
  );
  if (!items.length)
    return (
      <section className="empty-state" role="status">
        <Icon name="search" />
        <h2>No matching dishes</h2>
        <p>Try a different food or station name.</p>
      </section>
    );
  return (
    <section className="hall" aria-label={`${day.hall.name} ${period} menu`}>
      <p className="results-count" aria-live="polite">
        {items.length} {items.length === 1 ? "dish" : "dishes"}
        {term ? ` matching “${query.trim()}”` : " · Nutrition per serving"}
      </p>
      {byCategory(items).map(([category, items]) => (
        <section className="category" key={category} aria-label={category}>
          <div className="category-heading">
            <h3 className="category-name">{category}</h3>
            <span>{items.length.toString().padStart(2, "0")}</span>
            <div />
          </div>
          <ul className="items">
            {items.map((item, index) => (
              <ItemRow key={`${item.id}-${index}`} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
