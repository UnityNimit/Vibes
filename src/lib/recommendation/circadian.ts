import type { CircadianInfo, CircadianPeriod } from './types';

/**
 * Calculates current circadian rhythm & time-of-day ambient pattern
 * Adapts dynamically to local user time and weekend status.
 */
export function getCircadianInfo(date = new Date()): CircadianInfo {
  const hour = date.getHours();
  const day = date.getDay(); // 0 is Sunday, 6 is Saturday, 5 is Friday
  const isWeekend = day === 0 || day === 6 || (day === 5 && hour >= 17);

  if (hour >= 0 && hour < 5) {
    return {
      period: 'late_night',
      label: 'Midnight Flow',
      sublabel: 'Atmospheric dark pop, synthwave & ambient beats',
      icon: '🌙',
      queryKeyword: 'late_night',
      isWeekend
    };
  }

  if (hour >= 5 && hour < 9) {
    return {
      period: 'early_morning',
      label: 'Sunrise Awakening',
      sublabel: 'Warm acoustic, peaceful morning coffee & mellow rhythms',
      icon: '☕',
      queryKeyword: 'early_morning',
      isWeekend
    };
  }

  if (hour >= 9 && hour < 12) {
    return {
      period: 'morning',
      label: 'Deep Focus & Flow',
      sublabel: 'Modern productive energy & melodic momentum',
      icon: '⚡',
      queryKeyword: 'morning',
      isWeekend
    };
  }

  if (hour >= 12 && hour < 17) {
    return {
      period: 'afternoon',
      label: 'Midday Vibes',
      sublabel: 'Feel-good chart toppers & trending upbeat hits',
      icon: '☀️',
      queryKeyword: 'afternoon',
      isWeekend
    };
  }

  if (hour >= 17 && hour < 21) {
    return {
      period: 'evening',
      label: isWeekend ? 'Weekend Sunset Heat' : 'Sunset Chilldown',
      sublabel: isWeekend
        ? 'High energy, dance & party anthems'
        : 'Golden hour indie, smooth R&B & twilight vibes',
      icon: isWeekend ? '🔥' : '🌅',
      queryKeyword: isWeekend ? 'party' : 'evening',
      isWeekend
    };
  }

  // 21:00 - 24:00
  return {
    period: 'late_night',
    label: isWeekend ? 'Nightlife & Bass' : 'Night Drive',
    sublabel: isWeekend
      ? 'Viral club hits & high BPM party bangers'
      : 'Chill lofi, midnight roadtrip & deep bass',
    icon: isWeekend ? '🎉' : '🌃',
    queryKeyword: isWeekend ? 'party' : 'late_night',
    isWeekend
  };
}
