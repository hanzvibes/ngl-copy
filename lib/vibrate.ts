/** Tiny haptic tap for a native feel. No-op where vibration is unsupported. */
export function tap(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
