import type { RankDelta } from '../domain/rank';
import type { LeagueEntryDto, MatchParticipantDto } from '../riot/types';

export interface PlayerRef {
  accountId: number;
  discordUserId: string;
  gameName: string;
  tagLine: string;
  platform: string;
}

export interface RankSnapshotView {
  tier: string;
  rank: string;
  leaguePoints: number;
}

export interface LivePlayerView {
  player: PlayerRef;
  championId: number;
  rank: LeagueEntryDto | null;
}

export interface LiveGameView {
  matchId: string;
  queueId: number;
  queueName: string;
  startedAt: number;
  players: LivePlayerView[];
}

export interface FinishedPlayerView {
  player: PlayerRef;
  participant: MatchParticipantDto;
  rankAfter: LeagueEntryDto | null;
  rankBefore: RankSnapshotView | null;
  delta: RankDelta | null;
}

export interface FinishedGameView {
  matchId: string;
  queueId: number;
  queueName: string;
  durationSeconds: number;
  endedAt: number;
  remake: boolean;
  players: FinishedPlayerView[];
}
