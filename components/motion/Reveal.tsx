"use client";

// Scroll-reveal wrapper, shared by every animated section on the site.
//
// PATTERN (picked from motion.dev, the Motion site, 2026-11-01, and
// already proven on the sibling AI Studio and PDF Tools Hub sites):
// elements fade in and rise a small distance as they enter the
// viewport. Values follow the UI/UX Pro Max "Scroll Reveal" guidance
// (Subtle tier): opacity 0 -> 1, y offset only 12px so it reads as a
// fade, not a slide, 300-400ms, easeOut, list items staggered 0.03s.
//
// SAFETY RULES (both sources agree, and this component enforces them):
// - Transform + opacity ONLY — never width/height, so no layout
//   shift (CLS) and no reflow jank.
// - Reduced motion: users who prefer reduced motion get the final
//   state immediately, with no animation at all.
// - No-JS fallback: `initial` is applied by JavaScript only, so with
//   JavaScript off (or before hydration) the content is fully visible.
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds (0.03 per list item is the guide). */
  delay?: number;
}) {
  const reduce = usePrefersReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.35, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
