/**
 * Platform utilities for detecting environment (Android, iOS, Mobile vs Desktop / Windows)
 */

export function isAndroid(): boolean {
  if (typeof navigator !== 'undefined') {
    return /android/i.test(navigator.userAgent);
  }
  return false;
}

export function isIOS(): boolean {
  if (typeof navigator !== 'undefined') {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }
  return false;
}

export function isMobile(): boolean {
  if (typeof navigator !== 'undefined') {
    if (isAndroid() || isIOS() || /mobile|tablet/i.test(navigator.userAgent)) {
      return true;
    }
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(max-width: 768px) and (hover: none) and (pointer: coarse)').matches) {
      return true;
    }
  }
  return false;
}

export function isWindows(): boolean {
  if (typeof navigator !== 'undefined') {
    return /windows/i.test(navigator.userAgent);
  }
  return false;
}

export function isDesktop(): boolean {
  return !isMobile();
}

