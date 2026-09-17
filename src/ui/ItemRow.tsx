import type { MenuItem } from "../domain/types";
function Nutrient({ value, label }: { value: number | null; label: string }) {
  return (
    <span className="macro">
      <span className="macro-label">{label}</span>
      <span>
        <b>{value === null ? "—" : value}</b>
        {value !== null && <span className="unit">g</span>}
      </span>
    </span>
  );
}
export function ItemRow({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd?: (item: MenuItem) => void;
}) {
  return (
    <li className="item">
      <div className="item-head">
        <h4 className="item-name">{item.name}</h4>
        <p className="item-portion">{item.portion || "Portion not listed"}</p>
      </div>
      <div className="macros">
        <div className="calories">
          <b>{item.calories === null ? "—" : item.calories}</b>
          <span>kcal</span>
        </div>
        <div className="macro-breakdown">
          <Nutrient value={item.protein_g} label="Protein" />
          <Nutrient value={item.carbs_g} label="Carbs" />
          <Nutrient value={item.fat_g} label="Fat" />
        </div>
      </div>
      {onAdd && (
        <button
          type="button"
          className="add-to-plate"
          aria-label={`Add ${item.name} to plate`}
          onClick={() => onAdd(item)}
        >
          + Add to plate
        </button>
      )}
      {(item.labels.length > 0 || item.allergens.length > 0) && (
        <div className="item-tags">
          {item.labels.map((label) => (
            <span className="tag tag-label" key={label}>
              {label}
            </span>
          ))}
          {item.allergens.map((a) => (
            <span
              className={`tag tag-allergen${a.trace ? " tag-trace" : ""}`}
              key={`${a.name}-${String(a.trace)}`}
            >
              {/*
                A bare asterisk tells a reader nothing, and a purely visual
                distinction tells a screen reader nothing. Spell it out.
              */}
              {a.trace ? `may contain ${a.name}` : a.name}
            </span>
          ))}
        </div>
      )}
      {item.ingredients && (
        <details className="item-details">
          <summary>
            Ingredients<span aria-hidden="true">+</span>
          </summary>
          <p>{item.ingredients}</p>
        </details>
      )}
    </li>
  );
}
