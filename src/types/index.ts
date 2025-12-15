export interface RegisteredAccount {
  id: number;
  discordUserId: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  createdAt: number;
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Match {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp: number;
    gameId: number;
    gameMode: string;
    gameType: string;
    queueId: number;
    participants: Participant[];
  };
}

export interface Participant {
  puuid: string;
  summonerName: string;
  championName: string;
  championId: number;
  teamId: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  champLevel: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
}

export interface LeagueEntry {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  summonerId: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

export interface TrackedGame {
  id: number;
  accountId: number;
  matchId: string;
  gameStartTime: number;
  gameEndTime: number | null;
  notifiedStart: boolean;
  notifiedEnd: boolean;
  lpBefore: number | null;
}

export interface ActiveGame {
  gameId: number;
  gameType: string;
  gameStartTime: number;
  gameLength: number;
  platformId: string;
  gameMode: string;
  mapId: number;
  gameQueueConfigId: number;
  participants: ActiveGameParticipant[];
}

export interface ActiveGameParticipant {
  summonerId: string;
  championId: number;
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  puuid: string;
}

// TFT Types
export interface TFTMatch {
  metadata: {
    match_id: string;
    participants: string[];
  };
  info: {
    game_datetime: number;
    game_length: number;
    game_version: string;
    queue_id: number;
    tft_set_number: number;
    participants: TFTParticipant[];
  };
}

export interface TFTParticipant {
  puuid: string;
  placement: number;
  level: number;
  last_round: number;
  time_eliminated: number;
  gold_left: number;
  total_damage_to_players: number;
  companion: {
    content_ID: string;
    skin_ID: number;
    species: string;
  };
  traits: TFTTrait[];
  units: TFTUnit[];
}

export interface TFTTrait {
  name: string;
  num_units: number;
  style: number;
  tier_current: number;
  tier_total: number;
}

export interface TFTUnit {
  character_id: string;
  itemNames: string[];
  items: number[];
  name: string;
  rarity: number;
  tier: number;
}

export interface TFTLeagueEntry {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  summonerId: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

export interface TFTActiveGame {
  gameId: number;
  gameStartTime: number;
  platformId: string;
  participants: TFTActiveParticipant[];
}

export interface TFTActiveParticipant {
  puuid: string;
  summonerId: string;
}

export interface TrackedTFTGame {
  id: number;
  accountId: number;
  matchId: string;
  gameStartTime: number;
  gameEndTime: number | null;
  notifiedStart: boolean;
  notifiedEnd: boolean;
  lpBefore: number | null;
}