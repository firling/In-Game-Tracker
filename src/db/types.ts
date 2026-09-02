/** Rows as they come out of the repositories (camelCase, typed). */

export interface Account {
  id: number;
  discordUserId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  platform: string;
  /** Discord user who ran /register; equals discordUserId for self-registration. */
  registeredBy: string;
  createdAt: number;
}

export type GameStatus = 'pending' | 'completed' | 'abandoned';

export interface TrackedGame {
  id: number;
  accountId: number;
  matchId: string;
  queueId: number;
  championId: number | null;
  startedAt: number;
  endedAt: number | null;
  notifiedStart: boolean;
  notifiedEnd: boolean;
  status: GameStatus;
  tierBefore: string | null;
  rankBefore: string | null;
  lpBefore: number | null;
  tierAfter: string | null;
  rankAfter: string | null;
  lpAfter: number | null;
  lpChange: number | null;
  win: boolean | null;
  championName: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  durationSeconds: number | null;
}

export interface LeagueSnapshot {
  id: number;
  accountId: number;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  absoluteLp: number;
  wins: number;
  losses: number;
  capturedAt: number;
}

export interface TrackedTftGame {
  id: number;
  accountId: number;
  matchId: string;
  queueId: number;
  startedAt: number;
  endedAt: number | null;
  notifiedStart: boolean;
  notifiedEnd: boolean;
  status: GameStatus;
  tierBefore: string | null;
  rankBefore: string | null;
  lpBefore: number | null;
  tierAfter: string | null;
  rankAfter: string | null;
  lpAfter: number | null;
  lpChange: number | null;
  placement: number | null;
  level: number | null;
  durationSeconds: number | null;
}
