import type { ImageSlot } from "../../images.gen";

export const HERO_SLIDES: { slot: ImageSlot; alt: string; credit: string }[] = [
  {
    slot: "hero-1",
    alt: "A hiker with a backpack crossing a golden mountain meadow in warm evening light",
    credit: "Alex Moliski",
  },
  {
    slot: "hero-2",
    alt: "A small figure on a mountain ridge, facing a low golden sun",
    credit: "Cristina Gottardi",
  },
  {
    slot: "hero-3",
    alt: "A traveller walking through a golden field towards distant mountains",
    credit: "Angel Balashev",
  },
];

/** Traveller counts are not real: always shown with the "Simulated data" label. */
export const DESTINATIONS: {
  slot: ImageSlot;
  country: string;
  title: string;
  line: string;
  travellers: number;
  alt: string;
}[] = [
  {
    slot: "dest-kyoto",
    country: "Japan",
    title: "Kyoto's old lanes",
    line: "Temple mornings and quiet streets before the crowds.",
    travellers: 34,
    alt: "A quiet stone lane in Kyoto leading up to the Yasaka Pagoda",
  },
  {
    slot: "dest-lisbon",
    country: "Portugal",
    title: "Lisbon by tram",
    line: "Steep hills, river views and late dinners in Alfama.",
    travellers: 52,
    alt: "A yellow tram climbing a narrow Lisbon street between pastel buildings",
  },
  {
    slot: "dest-hanoi",
    country: "Vietnam",
    title: "Hanoi at dusk",
    line: "Lake walks, street food and old-quarter coffee.",
    travellers: 41,
    alt: "Turtle Tower on Hoan Kiem Lake in Hanoi under a pink evening sky",
  },
  {
    slot: "dest-cusco",
    country: "Peru",
    title: "Cusco and the valley",
    line: "Acclimatise slowly, then head for the Sacred Valley.",
    travellers: 27,
    alt: "A narrow Cusco alley with orange walls and mountains beyond",
  },
  {
    slot: "dest-marrakech",
    country: "Morocco",
    title: "Marrakech medina",
    line: "Souks by day, rooftop terraces at sunset.",
    travellers: 38,
    alt: "Sacks of spices and dried goods at a market stall in Marrakech",
  },
  {
    slot: "dest-reykjavik",
    country: "Iceland",
    title: "Reykjavík and beyond",
    line: "Painted houses first, then glaciers and hot springs.",
    travellers: 19,
    alt: "Colourful houses on a Reykjavík street with the Hallgrímskirkja spire behind",
  },
];
