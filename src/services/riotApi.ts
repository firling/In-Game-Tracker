import axios, { AxiosInstance } from 'axios';
import { RiotAccount, Match, LeagueEntry, ActiveGame } from '../types';

class RiotApiService {
  private apiKey: string;
  private region: string = 'europe';
  private platform: string = 'euw1';
  private axiosInstance: AxiosInstance;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      headers: {
        'X-Riot-Token': this.apiKey
      }
    });
  }

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount | null> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching account for ${gameName}#${tagLine}:`, error.response?.data || error.message);
      return null;
    }
  }

  async getLeagueEntries(puuid: string): Promise<LeagueEntry[]> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching league entries for PUUID ${puuid}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getMatchIdsByPuuid(puuid: string, count: number = 5): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`,
        {
          params: {
            queue: 420, // Ranked Solo/Duo
            start: 0,
            count: count
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching match IDs for PUUID ${puuid}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getMatchIdsByPuuidAllQueues(puuid: string, count: number = 5): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`,
        {
          params: {
            start: 0,
            count: count
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching match IDs for PUUID ${puuid}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getMatchById(matchId: string): Promise<Match | null> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/lol/match/v5/matches/${matchId}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching match ${matchId}:`, error.response?.data || error.message);
      return null;
    }
  }

  async getActiveGame(puuid: string): Promise<ActiveGame | null> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // Player not in game
      }
      console.error(`Error fetching active game for PUUID ${puuid}:`, error.response?.data || error.message);
      return null;
    }
  }

  isRankedQueue(queueId: number): boolean {
    return queueId === 420 || queueId === 440; // 420 = Ranked Solo/Duo, 440 = Ranked Flex
  }

  getQueueName(queueId: number): string {
    const queueMap: { [key: number]: string } = {
      420: 'Ranked Solo/Duo',
      440: 'Ranked Flex',
      400: 'Normal Draft',
      430: 'Normal Blind',
      450: 'ARAM',
      900: 'URF'
    };
    return queueMap[queueId] || `Queue ${queueId}`;
  }
}

export default RiotApiService;
export { RiotApiService };