import type { MenuItem } from "../domain/types";

/** A missing macro shows an em dash. It must never render as 0. */
function Macro({ value, label, accent }: { value: number | null; label: string; accent?: boolean }) {
  return (
    <span className={accent ? "macro macro-accent" : "macro"}>
      <b>{value === null ? "—" : value}</b>
      <span className="macro-label">{label}</span>
    </span>
  );
}

export function ItemRow({ item }: { item: MenuItem }) {
  return (
    <li className="item">
      <div className="item-head">
        <span className="item-name">{item.name}</span>
        {item.portion && <span className="item-portion">{item.portion}</span>}
      </div>
      <div className="macros">
        <Macro value={item.calories} label="cal" />
        <Macro value={item.protein_g} label="protein" accent />
        <Macro value={item.fat_g} label="fat" />
        <Macro value={item.carbs_g} label="carbs" />
      </div>
    </li>
  );
}
