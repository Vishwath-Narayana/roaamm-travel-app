import { useEffect, useRef, useState } from "react";
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

/**
 * True once the element is within `margin` of the viewport. Native lazy loading
 * starts fetching up to ~2500px early on slow connections, which competes with
 * the hero photo; this waits until the photo is actually close.
 */
function useNear(enabled: boolean, margin = "600px") {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(!enabled || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin} 0px` },
    );
    // Photos inside a horizontal carousel are clipped by it, so watch the whole
    // carousel instead (marked with data-near-root).
    io.observe(ref.current.closest<HTMLElement>("[data-near-root]") ?? ref.current);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

/**
 * A responsive photo: AVIF, then WebP, then JPEG, with fixed dimensions (no
 * layout shift). Non-priority photos only load when they are near the screen;
 * their container keeps its size meanwhile.
 */
export function Photo({ slot, alt, sizes, priority = false, className }: PhotoProps) {
  const { widths, jpegWidths, width, height, placeholder } = IMAGES[slot];
  const fallback = jpegWidths[jpegWidths.length - 1];
  const [ref, near] = useNear(!priority);
  const [loaded, setLoaded] = useState(priority);
  const cls = ["photo", className].filter(Boolean).join(" ");
  // The blurred placeholder fills the box until the real photo arrives.
  const style = { backgroundImage: `url("${placeholder}")` };

  if (!near) return <picture ref={ref} className={cls} style={style} />;
  return (
    <picture className={cls} style={style}>
      <source type="image/avif" srcSet={srcSet(slot, "avif", widths)} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(slot, "webp", widths)} sizes={sizes} />
      <img
        // A cached photo can finish loading before React attaches onLoad.
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        src={`${BASE}/${slot}-${fallback}.jpg`}
        srcSet={srcSet(slot, "jpg", jpegWidths)}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
      />
    </picture>
  );
}
