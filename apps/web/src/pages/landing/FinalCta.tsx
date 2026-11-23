import { Button } from "../../components/Button";
import { Photo } from "../../components/Photo";
import { Reveal } from "../../motion";
import { Link } from "../../router";
import "./FinalCta.css";

export function FinalCta() {
  return (
    <section className="final-cta cv-auto" aria-labelledby="cta-title">
      <div className="final-cta__media" aria-hidden="true">
        <Photo slot="cta-bleed" alt="" sizes="100vw" />
      </div>
      <div className="container final-cta__inner">
        <Reveal variant="scale" className="final-cta__card">
          <h2 id="cta-title">
            See it for <span className="serif">yourself</span>
          </h2>
          <p className="lead">
            Open a sandbox account as a traveller, guide or admin in one click. No sign-up needed.
          </p>
          <Button href="/demo" size="lg" arrow>
            Open the demo
          </Button>
          <p className="final-cta__account">
            Or <Link href="/signup">create an account</Link> with a passkey.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
