/**
 * One source of truth for motion. CSS twins of these live in app/globals.css.
 * Values are proposals from research and must be tuned on a real mid-range Android phone.
 * Rule: animate only transform and opacity.
 */
export const dur = { instant: 0.1, fast: 0.16, base: 0.24, slow: 0.36 } as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const spring = {
  calm: { type: "spring", visualDuration: 0.35, bounce: 0 },
  gentle: { type: "spring", visualDuration: 0.45, bounce: 0.15 },
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0 },
} as const;

/** Stagger step in seconds. Cap the staggered items at 6 and only on first load. */
export const STAGGER = 0.04;
export const STAGGER_CAP = 6;

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
} as const;

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: dur.fast, ease: ease.out } },
} as const;

export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_CAP) * STAGGER;
}
