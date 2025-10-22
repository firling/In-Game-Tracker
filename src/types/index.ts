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