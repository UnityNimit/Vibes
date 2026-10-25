import type { RegionCode, RegionOption } from './types';

export const REGION_OPTIONS: RegionOption[] = [
  { code: 'AUTO', label: 'Auto (Detected)', flag: '📍' },
  { code: 'GLOBAL', label: 'Global Worldwide', flag: '🌐' },
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IN', label: 'India', flag: '🇮🇳' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺' },
  { code: 'DE', label: 'Germany', flag: '🇩🇪' },
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'JP', label: 'Japan', flag: '🇯🇵' },
  { code: 'KR', label: 'South Korea', flag: '🇰🇷' },
  { code: 'BR', label: 'Brazil', flag: '🇧🇷' }
];

const STORAGE_REGION_KEY = 'vibes_trending_region_preference';

/**
 * Maps common IANA timezones and browser languages to ISO 3166-1 alpha-2 country codes.
 */
export function detectLocalRegionCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) return 'IN';
    if (tz.includes('New_York') || tz.includes('Los_Angeles') || tz.includes('Chicago') || tz.includes('Denver')) return 'US';
    if (tz.includes('London')) return 'GB';
    if (tz.includes('Toronto') || tz.includes('Vancouver')) return 'CA';
    if (tz.includes('Sydney') || tz.includes('Melbourne')) return 'AU';
    if (tz.includes('Berlin') || tz.includes('Frankfurt')) return 'DE';
    if (tz.includes('Paris')) return 'FR';
    if (tz.includes('Tokyo')) return 'JP';
    if (tz.includes('Seoul')) return 'KR';
    if (tz.includes('Sao_Paulo')) return 'BR';

    if (typeof navigator !== 'undefined' && navigator.language) {
      const parts = navigator.language.split('-');
      if (parts.length > 1) {
        const country = parts[1].toUpperCase();
        if (['US', 'GB', 'IN', 'CA', 'AU', 'DE', 'FR', 'JP', 'KR', 'BR'].includes(country)) {
          return country;
        }
      }
    }
  } catch (_) {}

  return 'US';
}

export function getStoredRegionPreference(): RegionCode {
  if (typeof window === 'undefined') return 'AUTO';
  try {
    const val = localStorage.getItem(STORAGE_REGION_KEY) as RegionCode | null;
    if (val && REGION_OPTIONS.some(r => r.code === val)) {
      return val;
    }
  } catch (_) {}
  return 'AUTO';
}

export function saveStoredRegionPreference(region: RegionCode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_REGION_KEY, region);
}

/**
 * Resolves the actual 2-letter country code sent to InnerTube.
 */
export function resolveEffectiveCountryCode(selectedRegion: RegionCode): string {
  if (selectedRegion === 'AUTO') {
    return detectLocalRegionCode();
  }
  if (selectedRegion === 'GLOBAL') {
    return 'US'; // Global charts fallback
  }
  return selectedRegion;
}
