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
