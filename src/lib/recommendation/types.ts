import type { Song } from '../types';

export type TrendingMood =
  | 'all'
  | 'charts'
  | 'viral'
  | 'circadian'
  | 'late_night'
  | 'chill'
  | 'energy'
  | 'party';

export type RegionCode =
  | 'AUTO'
  | 'GLOBAL'
  | 'US'
  | 'GB'
  | 'IN'
  | 'CA'
  | 'AU'
  | 'DE'
  | 'FR'
  | 'JP'
  | 'KR'
  | 'BR';

export type CircadianPeriod =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'late_night';

export interface CircadianInfo {
  period: CircadianPeriod;
  label: string;
  sublabel: string;
  icon: string;
  queryKeyword: string;
  isWeekend: boolean;
}

export interface RegionOption {
  code: RegionCode;
  label: string;
  flag: string;
}

export interface MoodOption {
  id: TrendingMood;
  label: string;
  icon: string;
  description: string;
}

export interface HistoryItem {
  song: Song;
  playedAt: number;
  playCount: number;
}

export interface ArtistAffinity {
  artist: string;
  score: number;
  playCount: number;
  likeCount: number;
  lastInteracted: number;
}

export interface UserTasteProfile {
  history: HistoryItem[];
  playCounts: Record<string, number>;
  artistAffinities: Record<string, ArtistAffinity>;
  recentSearches: string[];
}

export interface PersistentFeedData {
  recommendedSongs: Song[];
  recommendedToken: string | null;
  trendingSongs: Song[];
  trendingToken: string | null;
  newSongs: Song[];
  newToken: string | null;
  oldSongs: Song[];
  oldToken: string | null;
  recommendedSearches: string[];
  lastUpdated: number;
  trendingMood?: TrendingMood;
  trendingRegion?: RegionCode;
}
