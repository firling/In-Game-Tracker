/** Riot API response shapes (only the fields we actually consume). */

export interface RiotAccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface LeagueEntryDto {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  puuid: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

export interface CurrentGameParticipantDto {
  puuid: string;
  championId: number;
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  riotId?: string;
}

export interface CurrentGameInfoDto {
  gameId: number;
  gameType: string;
  gameStartTime: number;
  gameLength: number;
  platformId: string;
  gameMode: string;
  mapId: number;
  gameQueueConfigId: number;
  participants: CurrentGameParticipantDto[];
}

export interface MatchParticipantDto {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championName: string;
  championId: number;
  teamId: number;
  teamPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  gameEndedInEarlySurrender: boolean;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  champLevel: number;
  goldEarned: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameStartTimestamp: number;
    gameId: number;
    gameMode: string;
    gameType: string;
    queueId: number;
    participants: MatchParticipantDto[];
    teams: Array<{ teamId: number; win: boolean }>;
  };
}

export interface TftParticipantDto {
  puuid: string;
  placement: number;
  level: number;
  last_round: number;
  gold_left: number;
  total_damage_to_players: number;
  traits: Array<{ name: string; num_units: number; style: number; tier_current: number; tier_total: number }>;
  units: Array<{ character_id: string; itemNames: string[]; name: string; rarity: number; tier: number }>;
}

export interface TftMatchDto {
  metadata: { match_id: string; participants: string[] };
  info: {
    game_datetime: number;
    game_length: number;
    queue_id?: number;
    queueId?: number;
    tft_set_number: number;
    participants: TftParticipantDto[];
  };
}
