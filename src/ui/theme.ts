/** Shared visual language for every embed the bot sends. */

export const COLORS = {
  /** Discord's own green/red so results read the same in light and dark mode. */
  victory: 0x2dc08d,
  defeat: 0xed4245,
  remake: 0x9aa0a6,
  live: 0x5865f2,
  info: 0x5865f2,
  recap: 0xe8b339,
  warning: 0xfaa61a,
  neutral: 0x2b2d31
} as const;

export const EMOJI = {
  live: '🔴',
  victory: '🏆',
  defeat: '💀',
  remake: '⚪',
  queue: '🎯',
  champion: '⚔️',
  duration: '⏱️',
  kda: '🗡️',
  cs: '🌾',
  vision: '👁️',
  damage: '💥',
  gold: '🪙',
  rank: '🎖️',
  up: '📈',
  down: '📉',
  flat: '➖',
  promotion: '⬆️',
  demotion: '⬇️',
  streak: '🔥',
  duo: '🤝',
  calendar: '📅',
  chart: '📊',
  crown: '👑',
  medal: ['🥇', '🥈', '🥉']
} as const;

/** Zero-width space: the only way to get an "empty" embed field title. */
export const BLANK = '​';

export function trendEmoji(value: number): string {
  if (value > 0) return EMOJI.up;
  if (value < 0) return EMOJI.down;
  return EMOJI.flat;
}

export function resultColor(win: boolean | null, remake = false): number {
  if (remake) return COLORS.remake;
  if (win === null) return COLORS.neutral;
  return win ? COLORS.victory : COLORS.defeat;
}
