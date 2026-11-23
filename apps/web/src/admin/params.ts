import { navigate } from "../router";

/** The current URL with one query parameter set (or removed when value is null). */
export function withParam(name: string, value: string | null): string {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  return url.pathname + url.search;
}

/** Opens or closes a linkable detail drawer (?id=...). */
export function openDetail(id: string | null): void {
  navigate(withParam("id", id));
}
