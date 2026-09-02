import { DIVISIONS, isApexTier, TIERS } from '../riot/constants';

/**
 * Rank arithmetic.
 *
 * Riot exposes a rank as (tier, division, lp) which cannot be subtracted
 * directly: a player going Gold I 88 LP → Platinum IV 12 LP gained LP even
 * though the raw `leaguePoints` went down. We project every rank onto a single
 * absolute LP axis and diff that instead.
 *
 * Apex tiers (Master / Grandmaster / Challenger) have no divisions and
 * unbounded LP, so they all share the Master floor on that axis.
 */

const LP_PER_DIVISION = 100;
const DIVISIONS_PER_TIER = 4;
const LP_PER_TIER = LP_PER_DIVISION * DIVISIONS_PER_TIER;
const APEX_FLOOR = TIERS.indexOf('MASTER') * LP_PER_TIER;

export interface RankLike {
  tier: string;
  rank: string;
  leaguePoints: number;
}

export function tierIndex(tier: string): number {
  const index = (TIERS as readonly string[]).indexOf(tier?.toUpperCase() ?? '');
  return index === -1 ? 0 : index;
}

function divisionIndex(division: string): number {
  const index = (DIVISIONS as readonly string[]).indexOf(division?.toUpperCase() ?? '');
  return index === -1 ? 0 : index;
}

/** Projects a rank onto a single monotonically increasing LP axis. */
export function absoluteLp(tier: string, division: string, leaguePoints: number): number {
  if (!tier) return 0;
  if (isApexTier(tier)) return APEX_FLOOR + leaguePoints;
  return tierIndex(tier) * LP_PER_TIER + divisionIndex(division) * LP_PER_DIVISION + leaguePoints;
}

export function absoluteLpOf(rank: RankLike): number {
  return absoluteLp(rank.tier, rank.rank, rank.leaguePoints);
}

export interface RankDelta {
  /** Net LP gained (positive) or lost (negative). */
  lp: number;
  /** True when the player moved to a different tier or division. */
  divisionChanged: boolean;
  promoted: boolean;
  demoted: boolean;
}

export function rankDelta(before: RankLike, after: RankLike): RankDelta {
  const lp = absoluteLpOf(after) - absoluteLpOf(before);
  const sameTier = before.tier?.toUpperCase() === after.tier?.toUpperCase();
  const sameDivision = before.rank?.toUpperCase() === after.rank?.toUpperCase();
  // Apex tiers report rank "I" permanently, so only the tier matters there.
  const divisionChanged = isApexTier(after.tier) && isApexTier(before.tier)
    ? !sameTier
    : !sameTier || !sameDivision;

  const beforeFloor = isApexTier(before.tier)
    ? APEX_FLOOR
    : tierIndex(before.tier) * LP_PER_TIER + divisionIndex(before.rank) * LP_PER_DIVISION;
  const afterFloor = isApexTier(after.tier)
    ? APEX_FLOOR
    : tierIndex(after.tier) * LP_PER_TIER + divisionIndex(after.rank) * LP_PER_DIVISION;

  return {
    lp,
    divisionChanged,
    promoted: divisionChanged && afterFloor > beforeFloor,
    demoted: divisionChanged && afterFloor < beforeFloor
  };
}

const TIER_LABELS: Record<string, string> = {
  IRON: 'Fer',
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
  EMERALD: 'Émeraude',
  DIAMOND: 'Diamant',
  MASTER: 'Maître',
  GRANDMASTER: 'Grand Maître',
  CHALLENGER: 'Challenger'
};

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier?.toUpperCase()] ?? tier ?? 'Non classé';
}

/** "Diamant II" — apex tiers drop the meaningless division. */
export function formatDivision(tier: string, division: string): string {
  if (!tier) return 'Non classé';
  return isApexTier(tier) ? tierLabel(tier) : `${tierLabel(tier)} ${division}`;
}

/** "Diamant II · 45 LP" */
export function formatRank(rank: RankLike | null | undefined): string {
  if (!rank || !rank.tier) return 'Non classé';
  return `${formatDivision(rank.tier, rank.rank)} · ${rank.leaguePoints} LP`;
}

export function formatLpChange(lp: number): string {
  if (lp === 0) return '±0 LP';
  return `${lp > 0 ? '+' : '−'}${Math.abs(lp)} LP`;
}

/** Colour of the tier crest, used to tint embeds. */
export function tierColor(tier: string | null | undefined): number {
  switch (tier?.toUpperCase()) {
    case 'IRON': return 0x6b5a52;
    case 'BRONZE': return 0x8c5230;
    case 'SILVER': return 0x80989d;
    case 'GOLD': return 0xcd8837;
    case 'PLATINUM': return 0x4e9996;
    case 'EMERALD': return 0x30a56b;
    case 'DIAMOND': return 0x576bce;
    case 'MASTER': return 0x9d48e0;
    case 'GRANDMASTER': return 0xcd4545;
    case 'CHALLENGER': return 0xf4c874;
    default: return 0x4f545c;
  }
}

const EMBLEM_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images';

export function tierEmblemUrl(tier: string | null | undefined): string {
  const slug = (tier ?? 'unranked').toLowerCase();
  return `${EMBLEM_BASE}/ranked-emblem/emblem-${slug}.png`;
}

export function tierMiniCrestUrl(tier: string | null | undefined): string {
  const slug = (tier ?? 'unranked').toLowerCase();
  return `${EMBLEM_BASE}/ranked-mini-crests/${slug}.png`;
}

/** Ten-segment bar showing progress inside the current division. */
export function lpProgressBar(rank: RankLike, width = 10): string {
  if (isApexTier(rank.tier)) return '';
  const filled = Math.max(0, Math.min(width, Math.round((rank.leaguePoints / LP_PER_DIVISION) * width)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  return total === 0 ? null : (wins / total) * 100;
}
