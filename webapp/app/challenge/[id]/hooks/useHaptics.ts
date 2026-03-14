/* webapp/app/components/challenge/useHaptics.ts */
"use client";

type VibratePattern = number | number[];

function canVibrate() {
  return typeof navigator !== "undefined" && "vibrate" in navigator && typeof navigator.vibrate === "function";
}

function vibrate(pattern: VibratePattern) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

export function useHaptics() {
  const light = () => vibrate(6);
  const success = () => vibrate([8, 26, 8]);
  const error = () => vibrate([14, 22, 14]);

  return { light, success, error };
}