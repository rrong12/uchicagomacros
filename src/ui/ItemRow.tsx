import type { MenuItem } from "../domain/types";

const fmt = (v: number | null, unit: string) =>
  v === null ? "—" : `${v}${unit}`;

export function ItemRow({ item }: { item: MenuItem }) {
  return (
    <li className="item">
      <div className="item-head">
        <span className="item-name">{item.name}</span>
        {item.portion && <span className="item-portion">{item.portion}</span>}
      </div>
      <div className="item-macros">
        <span>{fmt(item.calories, " cal")}</span>
        <span>P {fmt(item.protein_g, "g")}</span>
        <span>F {fmt(item.fat_g, "g")}</span>
        <span>C {fmt(item.carbs_g, "g")}</span>
      </div>
    </li>
  );
}
