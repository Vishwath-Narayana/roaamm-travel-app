import { SortIcon } from "./icons";

/** A sortable column header: a button inside the <th>, with aria-sort on the header. */
export function SortHeader({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onSort: () => void;
}) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="adm-sort" onClick={onSort} data-active={active}>
        {label}
        <SortIcon size={12} />
        {active && <span className="visually-hidden">, sorted {dir === "asc" ? "ascending" : "descending"}</span>}
      </button>
    </th>
  );
}
