// navigator.vibrate where it exists (Android Chrome/Firefox). iOS Safari has no Vibration API,
// so on iPhone this is a silent no-op.
let enabled = true;

export function setHaptics(on: boolean) {
  enabled = on;
}

export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function buzz(pattern: number | number[]) {
  if (!enabled || !hapticsSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
