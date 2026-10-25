// Backward-compatibility bridge pointing to the dedicated recommendation system
import { recommendationEngine } from './recommendation/recommendationEngine.svelte';
export * from './recommendation/types';
export * from './recommendation/circadian';
export * from './recommendation/location';
export * from './recommendation/tasteProfile.svelte';
export * from './recommendation/trendingService';
export * from './recommendation/recommendationEngine.svelte';

export const feedStore = recommendationEngine;
