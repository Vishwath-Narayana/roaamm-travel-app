import { useId, type FormEvent } from "react";
import { SearchIcon } from "../../components/icons";
import { navigate } from "../../router";
import "./SearchBar.css";

/**
 * A preview of trip search. It does not search yet: submitting opens the demo,
 * and the note under the bar says so. No results are faked.
 */
export function SearchBar() {
  const id = useId();
  const noteId = `${id}-note`;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate("/demo");
  }

  return (
    <div className="search-wrap container">
      <form className="search" role="search" aria-label="Find travellers (preview)" onSubmit={onSubmit}>
        <div className="search__field">
          <label htmlFor={`${id}-where`}>Where</label>
          <input id={`${id}-where`} name="where" type="text" placeholder="Kyoto, Lisbon, anywhere" autoComplete="off" />
        </div>
        <fieldset className="search__field search__when">
          <legend>When</legend>
          <div className="search__dates">
            <label className="visually-hidden" htmlFor={`${id}-from`}>
              From
            </label>
            <input id={`${id}-from`} name="from" type="date" />
            <span aria-hidden="true">to</span>
            <label className="visually-hidden" htmlFor={`${id}-to`}>
              To
            </label>
            <input id={`${id}-to`} name="to" type="date" />
          </div>
        </fieldset>
        <div className="search__field">
          <label htmlFor={`${id}-as`}>Travelling as</label>
          <select id={`${id}-as`} name="as" defaultValue="traveller">
            <option value="traveller">Solo traveller</option>
            <option value="guide">Guide</option>
          </select>
        </div>
        <button type="submit" className="search__submit" aria-describedby={noteId}>
          <SearchIcon size={20} />
          <span className="search__submit-label">Search</span>
        </button>
      </form>
      <p id={noteId} className="search__note small">
        Opens the demo, search arrives in a later milestone.
      </p>
    </div>
  );
}
