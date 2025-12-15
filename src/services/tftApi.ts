import axios, { AxiosInstance } from 'axios';
import { TFTMatch, TFTLeagueEntry } from '../types';

class TFTApiService {
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

  async getLeagueEntries(puuid: string): Promise<TFTLeagueEntry[]> {
    try {
      // First get summonerId from puuid
      const summonerResponse = await this.axiosInstance.get(
        `https://${this.platform}.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${puuid}`
      );
      const summonerId = summonerResponse.data.id;

      // Then get league entries
      const response = await this.axiosInstance.get(
        `https://${this.platform}.api.riotgames.com/tft/league/v1/entries/by-summoner/${summonerId}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching TFT league entries for PUUID ${puuid}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getMatchIdsByPuuid(puuid: string, count: number = 5): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids`,
        {
          params: {
            start: 0,
            count: count
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching TFT match IDs for PUUID ${puuid}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getMatchById(matchId: string): Promise<TFTMatch | null> {
    try {
      const response = await this.axiosInstance.get(
        `https://${this.region}.api.riotgames.com/tft/match/v1/matches/${matchId}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching TFT match ${matchId}:`, error.response?.data || error.message);
      return null;
    }
  }

  async getActiveGameByPuuid(puuid: string): Promise<any> {
    try {
      // TFT uses the spectator endpoint
      const response = await this.axiosInstance.get(
        `https://${this.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`
      );

      // Check if it's a TFT game
      const game = response.data;
      if (this.isTFTQueue(game.gameQueueConfigId)) {
        return game;
      }
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // Player not in game
      }
      if (error.response?.status === 503) {
        return null; // Service temporarily unavailable
      }
      console.error(`Error fetching TFT active game for PUUID ${puuid}:`, error.response?.data || error.message);
      return null;
    }
  }

  isTFTQueue(queueId: number): boolean {
    // 1100 = Ranked TFT only
    return queueId === 1100;
  }

  isRankedTFTQueue(queueId: number): boolean {
    return queueId === 1100;
  }

  getQueueName(queueId: number): string {
    const queueMap: { [key: number]: string } = {
      1100: 'Ranked TFT',
      1090: 'Normal TFT',
      1110: 'TFT Tutorial'
    };
    return queueMap[queueId] || `TFT Queue ${queueId}`;
  }

  getQueueTypeFromQueueId(queueId: number): string {
    // Only ranked TFT (1100)
    return 'RANKED_TFT';
  }
}

export default TFTApiService;
export { TFTApiService };
