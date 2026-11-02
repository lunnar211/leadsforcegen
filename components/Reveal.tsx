// Canonical scroll-reveal lives in components/motion/Reveal.tsx (the
// Motion-based implementation). This re-export keeps the existing
// `import Reveal from "@/components/Reveal"` call sites working.
// The old CSS-transition implementation (`.reveal` in globals.css)
// is retired with this change; its rules were removed from globals.css.
export { Reveal as default } from "./motion/Reveal";
export { Reveal } from "./motion/Reveal";
