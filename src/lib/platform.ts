/**
 * Platform utilities for detecting environment (Android vs Windows / Desktop)
 */

export function isAndroid(): boolean {
  if (typeof navigator !== 'undefined') {
    return /android/i.test(navigator.userAgent);
  }
  return false;
}

export function isWindows(): boolean {
  if (typeof navigator !== 'undefined') {
    return /windows/i.test(navigator.userAgent);
  }
  return false;
}
