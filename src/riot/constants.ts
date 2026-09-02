/** Static Riot platform / queue / tier data shared across the app. */

/** Platform routing values (the shard a summoner plays on). */
export const PLATFORMS = [
  'br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'me1', 'na1',
  'oc1', 'ph2', 'ru', 'sg2', 'th2', 'tr1', 'tw2', 'vn2'
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Regional routing values (used by account-v1 and match-v5). */
export type RegionalRoute = 'americas' | 'asia' | 'europe' | 'sea';

const PLATFORM_TO_REGION: Record<Platform, RegionalRoute> = {
  br1: 'americas', la1: 'americas', la2: 'americas', na1: 'americas',
  eun1: 'europe', euw1: 'europe', me1: 'europe', ru: 'europe', tr1: 'europe',
  jp1: 'asia', kr: 'asia',
  oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};

/** Short code used by op.gg / other third-party profile sites. */
const PLATFORM_TO_OPGG: Record<Platform, string> = {
  br1: 'br', eun1: 'eune', euw1: 'euw', jp1: 'jp', kr: 'kr', la1: 'lan',
  la2: 'las', me1: 'me', na1: 'na', oc1: 'oce', ph2: 'ph', ru: 'ru',
  sg2: 'sg', th2: 'th', tr1: 'tr', tw2: 'tw', vn2: 'vn'
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function regionalRouteFor(platform: Platform): RegionalRoute {
  return PLATFORM_TO_REGION[platform];
}

export function opggRegionFor(platform: Platform): string {
  return PLATFORM_TO_OPGG[platform];
}

/** Queues we track. Anything else is ignored by the trackers. */
export const QUEUE_RANKED_SOLO = 420;
export const QUEUE_RANKED_FLEX = 440;
export const TRACKED_QUEUES: readonly number[] = [QUEUE_RANKED_SOLO, QUEUE_RANKED_FLEX];

export const QUEUE_TFT_RANKED = 1100;
export const QUEUE_TFT_HYPER_ROLL = 1130;
export const QUEUE_TFT_DOUBLE_UP = 1160;
export const TRACKED_TFT_QUEUES: readonly number[] = [QUEUE_TFT_RANKED, QUEUE_TFT_DOUBLE_UP];

export type QueueType = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR';

export function queueTypeFor(queueId: number): QueueType | null {
  if (queueId === QUEUE_RANKED_SOLO) return 'RANKED_SOLO_5x5';
  if (queueId === QUEUE_RANKED_FLEX) return 'RANKED_FLEX_SR';
  return null;
}

const QUEUE_NAMES: Record<number, string> = {
  400: 'Normale Draft',
  420: 'Classée Solo/Duo',
  430: 'Normale Aveugle',
  440: 'Classée Flex',
  450: 'ARAM',
  490: 'Normale Rapide',
  700: 'Clash',
  720: 'Clash ARAM',
  900: 'URF',
  1020: 'One For All',
  1090: 'TFT Normale',
  1100: 'TFT Classée',
  1110: 'TFT Tutoriel',
  1130: 'TFT Hyper Roll',
  1160: 'TFT Double Up',
  1700: 'Arena',
  1900: 'URF'
};

export function queueNameFor(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `File ${queueId}`;
}

export function queueLabel(queueType: QueueType): string {
  return queueType === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex';
}

/** Tier ladder, lowest first. Apex tiers have no divisions. */
export const TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'
] as const;
export type Tier = (typeof TIERS)[number];

export const APEX_TIERS: readonly string[] = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];

export const DIVISIONS = ['IV', 'III', 'II', 'I'] as const;
export type Division = (typeof DIVISIONS)[number];

export function isApexTier(tier: string): boolean {
  return APEX_TIERS.includes(tier.toUpperCase());
}
