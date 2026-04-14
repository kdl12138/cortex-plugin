const DECAY_K = 0.1;

/**
 * Compute the freshness of a memory based on elapsed time.
 * Returns a value between 0.0 and 1.0.
 * Uses logarithmic decay: 1 / (1 + k * ln(1 + hours)).
 */
export function computeFreshness(lastActive: Date, now: Date): number {
  const msElapsed = now.getTime() - lastActive.getTime();
  const hoursElapsed = Math.max(0, msElapsed / (1000 * 60 * 60));
  return 1.0 / (1.0 + DECAY_K * Math.log(1 + hoursElapsed));
}
