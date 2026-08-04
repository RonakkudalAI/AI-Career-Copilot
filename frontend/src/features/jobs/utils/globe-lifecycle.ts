export type PinLifecycleState = {
  t: number;
  opacity: number;
  offset: number;
  emissiveIntensity: number;
  labelVisible: boolean;
};

/**
 * Pure mathematical lifecycle calculation for repeating globe job pins using modulo arithmetic.
 *
 * @param elapsed Total elapsed time in seconds from Three.js clock
 * @param staggerOffset Stagger delay offset per pin (e.g. index * 1.2)
 * @param cycleDuration Total loop duration for 1 full cycle in seconds (default: 6.0s)
 * @param activeDuration Active animation phase duration before rest interval in seconds (default: 4.0s)
 */
export function calculatePinLifecycle(
  elapsed: number,
  staggerOffset: number,
  cycleDuration = 6.0,
  activeDuration = 4.0
): PinLifecycleState {
  const rawTime = elapsed - staggerOffset;
  // Non-negative modulo wrap around cycleDuration
  const t = ((rawTime % cycleDuration) + cycleDuration) % cycleDuration;

  const fadeInDuration = 0.5;
  const fadeOutDuration = 0.5;

  let opacity = 0;
  let offset = -0.1;
  let emissiveIntensity = 0.28;

  if (t < activeDuration) {
    if (t < fadeInDuration) {
      opacity = t / fadeInDuration;
      offset = (1 - opacity) * -0.1;
    } else if (t < activeDuration - fadeOutDuration) {
      opacity = 1;
      offset = 0;
      emissiveIntensity = 0.28 + Math.sin(t * 8) * 0.15;
    } else {
      const fadeProgress = (t - (activeDuration - fadeOutDuration)) / fadeOutDuration;
      opacity = 1 - fadeProgress;
      offset = fadeProgress * 0.05;
    }
  } else {
    // Inactive dormant interval before cycle repeats
    opacity = 0;
    offset = -0.1;
  }

  opacity = Math.max(0, Math.min(1, opacity));
  const labelVisible = opacity > 0.8;

  return { t, opacity, offset, emissiveIntensity, labelVisible };
}
