import { Button } from "../components/Button";
import { usePageTitle, useRoute } from "../router";
import "./Demo.css";

export function NotFound() {
  const path = useRoute();
  usePageTitle("Page not found");
  return (
    <div className="container page">
      <header className="page__head">
        <p className="mono page__lead">404</p>
        <h1>Page not found</h1>
        <p className="page__lead">
          There is nothing at <code>{path}</code>. It may have moved, or the link may be wrong.
        </p>
      </header>
      <Button href="/" size="lg">
        Back to home
      </Button>
    </div>
  );
}
