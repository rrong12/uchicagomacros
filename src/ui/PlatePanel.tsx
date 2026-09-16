import { itemKey, type usePlate } from "../state/usePlate";
interface Props {
  plate: ReturnType<typeof usePlate>;
  hall: string;
  period: string;
  date: string;
}
const macros = [
  ["calories", "Calories", "kcal"],
  ["protein_g", "Protein", "g"],
  ["carbs_g", "Carbs", "g"],
  ["fat_g", "Fat", "g"],
] as const;
export function PlatePanel({ plate, hall, period, date }: Props) {
  const { entries } = plate;
  return (
    <section
      id="your-plate"
      tabIndex={-1}
      className="plate-panel"
      aria-label="Your plate"
    >
      {entries.length > 0 && (
        <a className="plate-jump" href="#your-plate">
          <span aria-live="polite">
            View plate · {entries.length}{" "}
            {entries.length === 1 ? "dish" : "dishes"} ·{" "}
            {entries.reduce((sum, e) => sum + e.servings, 0)} servings
          </span>
          <span aria-hidden="true">↑</span>
        </a>
      )}
      <div className="plate-heading">
        <div>
          <p className="eyebrow">BUILD YOUR MEAL</p>
          <h2>Your plate</h2>
          <p>
            {hall} · {period} · {date}
          </p>
        </div>
        {entries.length > 0 && (
          <button type="button" className="text-button" onClick={plate.clear}>
            Clear plate
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="plate-empty">
          <strong>Your plate is empty</strong>
          <p>Add dishes below, then adjust how much you plan to eat.</p>
        </div>
      ) : (
        <>
          <div className="plate-totals" aria-live="polite">
            {macros.map(([key, label, unit]) => {
              const incomplete = entries.some((e) => e.item[key] === null);
              const total = entries.reduce(
                (sum, e) => sum + (e.item[key] ?? 0) * e.servings,
                0,
              );
              return (
                <div key={key}>
                  <span>{label}</span>
                  <strong aria-label={`${label} total`}>
                    {incomplete
                      ? "Incomplete"
                      : `${Number(total.toFixed(1))} ${unit}`}
                  </strong>
                </div>
              );
            })}
          </div>
          <ul className="plate-items">
            {entries.map((e) => (
              <li key={itemKey(e.item)}>
                <div>
                  <strong>{e.item.name}</strong>
                  <p>{e.item.portion || "Portion not listed"} per serving</p>
                </div>
                <div className="serving-controls">
                  <button
                    type="button"
                    disabled={e.servings <= 0.5}
                    aria-label={`Decrease ${e.item.name} servings`}
                    onClick={() => plate.change(itemKey(e.item), -0.5)}
                  >
                    −
                  </button>
                  <span>
                    {e.servings} {e.servings === 1 ? "serving" : "servings"}
                  </span>
                  <button
                    type="button"
                    disabled={e.servings >= 20}
                    aria-label={`Increase ${e.item.name} servings`}
                    onClick={() => plate.change(itemKey(e.item), 0.5)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="remove-dish"
                    aria-label={`Remove ${e.item.name}`}
                    onClick={() => plate.remove(itemKey(e.item))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="plate-note">
            Estimated from listed portions. Incomplete means a dish is missing
            that nutrient. Saved values reflect when you added the dish.
          </p>
        </>
      )}
      <p className="plate-save" role={plate.saveError ? "status" : undefined}>
        {plate.saveError
          ? "This browser could not save your plate. It will last only while this page stays open."
          : "Saved on this device · Separate plates for each hall and meal"}
      </p>
    </section>
  );
}
