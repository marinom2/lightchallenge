// webapp/lib/motion.ts
import type { MotionProps } from "framer-motion";

/** Soft pulsing halo used behind CTAs */
export const pulseHalo: MotionProps = {
  initial: { opacity: 0.55, scale: 0.96 },
  animate: {
    opacity: [0.55, 0.28, 0.55],
    scale: [0.96, 1.05, 0.96],
  },
  transition: {
    duration: 2.2,
    repeat: Infinity,
    ease: [0.42, 0.0, 0.58, 1.0], // easeInOut cubic-bezier
  },
};

/** Traveling sheen from left to right */
export const sheen: MotionProps = {
  initial: { x: "-120%" },
  animate: { x: "120%" },
  transition: {
    duration: 1.6,
    repeat: Infinity,
    ease: [0.0, 0.0, 1.0, 1.0], // linear cubic-bezier
  },
};

export const subtleTilt = { whileHover: { rotateZ: 0.6, scale: 1.01 } };
export const quickPop = { initial: { scale: 0.96 }, animate: { scale: 1.02 }, transition: { duration: 0.2 } };