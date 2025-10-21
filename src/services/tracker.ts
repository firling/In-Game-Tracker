import { Client, TextChannel } from 'discord.js';
import RiotApiService from './riotApi';
import { db } from '../database';
import { createGameStartEmbed, createGameEndEmbed } from '../utils/embeds';

class GameTracker {
  private client: Client;
  private riotApi: RiotApiService;
  private channelId: string;
  private trackingInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private activeGames: Map<number, string> = new Map(); // accountId -> gameId

  constructor(client: Client, riotApi: RiotApiService, channelId: string, trackingInterval: number = 60000) {
    this.client = client;
    this.riotApi = riotApi;
    this.channelId = channelId;
    this.trackingInterval = trackingInterval;
  }

  start() {
    console.log('Starting game tracker...');
    this.intervalId = setInterval(() => this.checkAllAccounts(), this.trackingInterval);
    this.checkAllAccounts(); // Run immediately
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Game tracker stopped.');
    }
  }

  private async checkAllAccounts() {
    const accounts = db.getAllAccounts();
    
    for (const account of accounts) {
      await this.checkAccount(account.id, account.puuid, account.gameName, account.tagLine, account.discordUserId);
      await this.sleep(1000); // Rate limiting
    }
  }

  private async checkAccount(accountId: number, puuid: string, gameName: string, tagLine: string, discordUserId: string) {
    try {
      // Check if player is in an active game
      const activeGame = await this.riotApi.getActiveGame(puuid);
      
      if (activeGame && this.riotApi.isRankedQueue(activeGame.gameQueueConfigId)) {
        const gameId = `${activeGame.gameId}`;
        
        // Check if this is a new game
        if (!this.activeGames.has(accountId) || this.activeGames.get(accountId) !== gameId) {
          this.activeGames.set(accountId, gameId);
          await this.notifyGameStart(accountId, gameName, tagLine, activeGame, discordUserId);
        }
      } else {
        // Player not in game, check if they just finished a game
        if (this.activeGames.has(accountId)) {
          const oldGameId = this.activeGames.get(accountId)!;
          this.activeGames.delete(accountId);
          
          // Wait a bit for match data to be available
          await this.sleep(5000);
          await this.checkRecentMatches(accountId, puuid, gameName, tagLine, discordUserId);
        }
      }
    } catch (error) {
      console.error(`Error checking account ${gameName}#${tagLine}:`, error);
    }
  }

  private async notifyGameStart(accountId: number, gameName: string, tagLine: string, activeGame: any, discordUserId: string) {
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) return;

      const participant = activeGame.participants.find((p: any) => p.puuid);
      const championId = participant?.championId || 0;
      const queueName = this.riotApi.getQueueName(activeGame.gameQueueConfigId);

      const embed = createGameStartEmbed(gameName, tagLine, championId, queueName, discordUserId);
      await channel.send({ embeds: [embed] });
      
      console.log(`Notified game start for ${gameName}#${tagLine}`);
    } catch (error) {
      console.error('Error notifying game start:', error);
    }
  }

  private async checkRecentMatches(accountId: number, puuid: string, gameName: string, tagLine: string, discordUserId: string) {
    try {
      const matchIds = await this.riotApi.getMatchIdsByPuuidAllQueues(puuid, 1);
      
      if (matchIds.length === 0) return;

      const latestMatchId = matchIds[0];
      const trackedGame = db.getTrackedGame(latestMatchId);

      // If this match hasn't been notified yet
      if (!trackedGame || !trackedGame.notifiedEnd) {
        const match = await this.riotApi.getMatchById(latestMatchId);
        if (!match) return;

        // Only notify ranked games
        if (!this.riotApi.isRankedQueue(match.info.queueId)) return;

        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (!participant) return;

        // Get current LP
        const leagueEntries = await this.riotApi.getLeagueEntries(puuid);
        const queueType = match.info.queueId === 420 ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
        const leagueEntry = leagueEntries.find(e => e.queueType === queueType);

        const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
        if (!channel) return;

        const embed = createGameEndEmbed(
          gameName,
          tagLine,
          participant,
          match.info.gameDuration,
          this.riotApi.getQueueName(match.info.queueId),
          leagueEntry,
          discordUserId
        );
        await channel.send({ embeds: [embed] });

        // Mark as notified
        if (!trackedGame) {
          db.addTrackedGame(accountId, latestMatchId, match.info.gameCreation);
        }
        db.markGameNotifiedEnd(latestMatchId);

        // Save league snapshot
        if (leagueEntry) {
          db.saveLeagueSnapshot(
            accountId,
            queueType,
            leagueEntry.tier,
            leagueEntry.rank,
            leagueEntry.leaguePoints,
            leagueEntry.wins,
            leagueEntry.losses
          );
        }

        console.log(`Notified game end for ${gameName}#${tagLine}`);
      }
    } catch (error) {
      console.error('Error checking recent matches:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default GameTracker;
export { GameTracker };