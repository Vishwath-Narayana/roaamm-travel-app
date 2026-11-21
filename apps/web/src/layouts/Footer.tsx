import { SERVICES } from "../services";
import { MarkIcon } from "../components/icons";
import "./Footer.css";

export const REPO_URL = "https://github.com/Vishwath-Narayana/roaamm-travel-app";
const STATUS_URL = new URL(SERVICES.find((s) => s.name === "status")!.url).origin;

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <p className="wordmark">
            <MarkIcon size={20} />
            ROAAMM
          </p>
          <p className="footer__note">Portfolio project. All data is simulated.</p>
        </div>

        <nav aria-label="Footer" className="footer__links">
          <ul>
            <li>
              <a href={STATUS_URL}>Status page</a>
            </li>
            <li>
              <a href={REPO_URL}>GitHub repository</a>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="footer-system" className="footer__system">
          <h2 id="footer-system" className="footer__heading">
            System
          </h2>
          <ul>
            {SERVICES.map((s) => (
              <li key={s.name}>
                <span>{s.label}</span>
                <code>{new URL(s.url).host}</code>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </footer>
  );
}
