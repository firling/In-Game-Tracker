import { opggRegionFor, type Platform, isPlatform } from '../riot/constants';

/** "24:31" — match duration from a raw second count. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Discord renders these in each viewer's own timezone. */
export function timestamp(ms: number, style: 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R' = 'R'): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

export function mention(discordUserId: string): string {
  return `<@${discordUserId}>`;
}

export function riotId(gameName: string, tagLine: string): string {
  return `${gameName}#${tagLine}`;
}

export function formatKda(kills: number, deaths: number, assists: number): string {
  return `${kills} / ${deaths} / ${assists}`;
}

export function kdaRatio(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return 'Parfait';
  return ((kills + assists) / deaths).toFixed(2);
}

function platformOrDefault(platform: string): Platform {
  return isPlatform(platform) ? platform : 'euw1';
}

function profileSlug(gameName: string, tagLine: string): string {
  return `${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
}

export function opggUrl(gameName: string, tagLine: string, platform: string): string {
  return `https://op.gg/lol/summoners/${opggRegionFor(platformOrDefault(platform))}/${profileSlug(gameName, tagLine)}`;
}

/** Live-game scouting page — only useful while the game is running. */
export function porofessorUrl(gameName: string, tagLine: string, platform: string): string {
  return `https://porofessor.gg/live/${opggRegionFor(platformOrDefault(platform))}/${profileSlug(gameName, tagLine)}`;
}

export function matchUrl(gameName: string, tagLine: string, platform: string, matchId: string): string {
  const gameIdPart = matchId.includes('_') ? matchId.split('_')[1] : matchId;
  return `${opggUrl(gameName, tagLine, platform)}/matches/${gameIdPart}`;
}

/** Truncates to Discord's field-value budget without cutting mid-escape. */
export function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function percent(value: number | null, digits = 0): string {
  return value === null ? '—' : `${value.toFixed(digits)} %`;
}

/** Pads a label so consecutive lines line up inside a code block. */
export function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}
