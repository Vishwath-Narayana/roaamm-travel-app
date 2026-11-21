import { Badge } from "../../components/Badge";
import { Photo } from "../../components/Photo";
import type { ImageSlot } from "../../images.gen";
import { Reveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Stories.css";

// Fictional authors and posts, labelled as simulated stories.
const STORIES: {
  kind: string;
  slot: ImageSlot;
  alt: string;
  title: string;
  excerpt: string;
  author: string;
  meta: string;
  stars?: number;
}[] = [
  {
    kind: "Trip post",
    slot: "dest-kyoto",
    alt: "A quiet stone lane in Kyoto leading up to the Yasaka Pagoda",
    title: "Three slow days in Kyoto",
    excerpt: "Early temples, one long tea afternoon, and the traveller from Lyon I met on day two.",
    author: "Mira, Canada",
    meta: "6 min read",
  },
  {
    kind: "Guide post",
    slot: "dest-hanoi",
    alt: "Turtle Tower on Hoan Kiem Lake in Hanoi under a pink evening sky",
    title: "Where Hanoi eats after dark",
    excerpt: "Five stalls in the Old Quarter I take every guest to, and what to order at each.",
    author: "Linh, licensed guide",
    meta: "4 min read",
  },
  {
    kind: "Guide review",
    slot: "dest-lisbon",
    alt: "A yellow tram climbing a narrow Lisbon street between pastel buildings",
    title: "Sofia knew every viewpoint",
    excerpt: "Three hours, two miradouros I would never have found, and the best pastel de nata of the trip.",
    author: "Theo, Australia",
    meta: "Booked 3 hours",
    stars: 5,
  },
];

export function Stories() {
  return (
    <section className="section cv-auto" aria-labelledby="stories-title" data-simulated-scope>
      <div className="container">
        <SectionHead
          className="stories__head"
          eyebrow="Stories"
          id="stories-title"
          title={
            <>
              Notes from the <span className="serif">road</span>
            </>
          }
          aside={<Badge>Simulated stories</Badge>}
        />
        <ul className="stories">
          {STORIES.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i} className="story">
              <div className="story__media">
                <Photo slot={s.slot} alt={s.alt} sizes="(min-width: 900px) 400px, 92vw" />
                <span className="story__kind">{s.kind}</span>
              </div>
              <div className="story__body">
                {s.stars && (
                  <p className="story__stars">
                    <span aria-hidden="true">{"★".repeat(s.stars)}</span>
                    <span className="visually-hidden">{s.stars} out of 5 stars</span>
                  </p>
                )}
                <h3>{s.title}</h3>
                <p className="story__excerpt">{s.excerpt}</p>
                <p className="story__meta small">
                  {s.author} · {s.meta}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
