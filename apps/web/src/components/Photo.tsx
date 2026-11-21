import { IMAGES, type ImageSlot } from "../images.gen";

export type PhotoProps = {
  slot: ImageSlot;
  /** Meaningful description, or "" for a purely decorative photo. */
  alt: string;
  /** Rendered width hint for the browser, e.g. "(min-width: 768px) 33vw, 80vw". */
  sizes: string;
  /** The single above-the-fold photo: loads first, never lazily. */
  priority?: boolean;
  className?: string;
};

const BASE = "/images";

function srcSet(slot: ImageSlot, ext: string, widths: readonly number[]) {
  return widths.map((w) => `${BASE}/${slot}-${w}.${ext} ${w}w`).join(", ");
}

/** A responsive photo: AVIF, then WebP, then JPEG, with fixed dimensions (no layout shift). */
export function Photo({ slot, alt, sizes, priority = false, className }: PhotoProps) {
  const { widths, jpegWidths, width, height } = IMAGES[slot];
  const fallback = jpegWidths[jpegWidths.length - 1];
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcSet(slot, "avif", widths)} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(slot, "webp", widths)} sizes={sizes} />
      <img
        src={`${BASE}/${slot}-${fallback}.jpg`}
        srcSet={srcSet(slot, "jpg", jpegWidths)}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
      />
    </picture>
  );
}
