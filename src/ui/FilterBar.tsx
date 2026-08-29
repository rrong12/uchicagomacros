import type { SortField, SortDirection } from "../domain/filter";

interface Props {
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (f: SortField) => void;
  onSortDirectionToggle: () => void;
}

const FIELDS: Array<{ value: SortField; label: string }> = [
  { value: "calories", label: "Calories" },
  { value: "protein_g", label: "Protein" },
  { value: "fat_g", label: "Fat" },
  { value: "carbs_g", label: "Carbs" },
];

export function FilterBar({
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionToggle,
}: Props) {
  return (
    <div className="filterbar">
      <div className="chips">
        {FIELDS.map((f) => (
          <button
            key={f.value}
            className={f.value === sortField ? "chip chip-active" : "chip"}
            onClick={() => onSortFieldChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <button className="chip" onClick={onSortDirectionToggle}>
        {sortDirection === "desc" ? "High → Low" : "Low → High"}
      </button>
    </div>
  );
}
