import { SERVICES } from "./services";

export function App() {
  return (
    <main className="shell">
      <h1 className="wordmark">ROAAMM</h1>
      <p className="tagline">
        End-to-end encrypted, real-time platform for verified solo travellers.
      </p>
      <p className="note">Foundation milestone (M0). The product is under construction.</p>
      <ul className="services" aria-label="Deployed services">
        {SERVICES.map((s) => (
          <li key={s.name}>
            <span>{s.label}</span>
            <code>{new URL(s.url).host}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
