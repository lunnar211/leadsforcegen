"use client";

// Press feedback for CTA links (hover 1.02 / tap 0.98, transform-only,
// so no layout shift). The link itself stays a Next Link — prefetch
// and client-side navigation are untouched; the motion sits on an
// inner span, so there is no anchor nesting and no nav change.
// Reduced-motion users get no motion at all. This is the adapted form
// of the sibling sites' shared motion Button: LeadsForceGen has no
// shared <button> component (its CTAs are Links; the only <button>s
// on the site live in Nav and SiteBanner, both out of motion scope),
// so the same press values live on the CTA links instead.
import Link from "next/link";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import type { ReactNode } from "react";

export function MotionLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <Link href={href}>
      <motion.span
        className={className}
        whileHover={reduce ? undefined : { scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
      >
        {children}
      </motion.span>
    </Link>
  );
}
