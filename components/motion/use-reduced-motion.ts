"use client";

// Reduced-motion detection that does NOT depend on Motion's
// useReducedMotion(): on this stack (Motion 14, Next 16) that hook
// stayed false even with <MotionConfig reducedMotion="user"> and
// matchMedia("(prefers-reduced-motion: reduce)") === true (proven
// by a local browser test on the sibling AI Studio site 2026-11-01).
// Plain matchMedia via useSyncExternalStore is bulletproof here.
// Server snapshot is false, so content is never hidden server-side;
// after hydration reduced-motion users get the final state immediately.
import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
