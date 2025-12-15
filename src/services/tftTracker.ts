import { Client, TextChannel } from 'discord.js';
import TFTApiService from './tftApi';
import { db } from '../database';
import { createTFTGameStartEmbed, createTFTGameEndEmbed } from '../utils/tftEmbeds';

class TFTGameTracker {
  private client: Client;
  private tftApi: TFTApiService;
  private channelId: string;
  private trackingInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private activeGames: Map<number, string> = new Map(); // accountId -> gameId

  constructor(client: Client, tftApi: TFTApiService, channelId: string, trackingInterval: number = 60000) {
    this.client = client;
    this.tftApi = tftApi;
    this.channelId = channelId;
    this.trackingInterval = trackingInterval;
  }

  start() {
    console.log('Starting TFT game tracker...');
    this.intervalId = setInterval(() => this.checkAllAccounts(), this.trackingInterval);
    this.checkAllAccounts(); // Run immediately
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('TFT game tracker stopped.');
    }
  }

  private async checkAllAccounts() {
    const accounts = db.getAllAccounts();
    console.log(`[TFT Tracker] Checking ${accounts.length} accounts...`);

    // Optimize: Check all accounts in batches to reduce sequential waiting
    const batchSize = 5; // Check 5 accounts in parallel
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      await Promise.all(
        batch.map(account =>
          this.checkAccount(account.id, account.puuid, account.gameName, account.tagLine, account.discordUserId)
        )
      );

      // Rate limiting between batches
      if (i + batchSize < accounts.length) {
        await this.sleep(1000);
      }
    }
  }

  private async checkAccount(accountId: number, puuid: string, gameName: string, tagLine: string, discordUserId: string) {
    try {
      // Check if player is in an active TFT game
      const activeGame = await this.tftApi.getActiveGameByPuuid(puuid);

      if (activeGame && this.tftApi.isRankedTFTQueue(activeGame.gameQueueConfigId)) {
        console.log(`[TFT Tracker] ${gameName}#${tagLine} is in an active TFT game (queue: ${activeGame.gameQueueConfigId})`);
        const gameId = `TFT_${activeGame.platformId}_${activeGame.gameId}`;

        // Check if this is a new game
        if (!this.activeGames.has(accountId) || this.activeGames.get(accountId) !== gameId) {
          this.activeGames.set(accountId, gameId);
          await this.notifyGameStart(accountId, gameName, tagLine, activeGame, discordUserId, puuid);
        }
      } else {
        // Player not in game, check if they just finished a game
        if (this.activeGames.has(accountId)) {
          console.log(`[TFT Tracker] ${gameName}#${tagLine} finished their game, checking recent matches...`);
          const oldGameId = this.activeGames.get(accountId)!;
          this.activeGames.delete(accountId);

          // Wait a bit for match data to be available (TFT takes longer to process)
          await this.sleep(10000);
          await this.checkRecentMatches(accountId, puuid, gameName, tagLine, discordUserId);
        } else {
          // Check recent matches even if not tracked (for games that finished while bot was offline)
          await this.checkRecentMatches(accountId, puuid, gameName, tagLine, discordUserId);
        }
      }
    } catch (error) {
      console.error(`Error checking TFT account ${gameName}#${tagLine}:`, error);
    }
  }

  private async notifyGameStart(accountId: number, gameName: string, tagLine: string, activeGame: any, discordUserId: string, puuid: string) {
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) return;

      const queueName = this.tftApi.getQueueName(activeGame.gameQueueConfigId);

      // Get current LP before the game
      const leagueEntries = await this.tftApi.getLeagueEntries(puuid);
      const queueType = this.tftApi.getQueueTypeFromQueueId(activeGame.gameQueueConfigId);
      const leagueEntry = leagueEntries.find(e => e.queueType === queueType);
      const lpBefore = leagueEntry?.leaguePoints;

      const embed = createTFTGameStartEmbed(gameName, tagLine, queueName, discordUserId);
      await channel.send({ embeds: [embed] });

      // Store game with LP before
      const gameId = `TFT_${activeGame.platformId}_${activeGame.gameId}`;
      db.addTrackedTFTGame(accountId, gameId, activeGame.gameStartTime, lpBefore);
      db.markTFTGameNotifiedStart(gameId);

      console.log(`Notified TFT game start for ${gameName}#${tagLine}`);
    } catch (error) {
      console.error('Error notifying TFT game start:', error);
    }
  }

  private async checkRecentMatches(accountId: number, puuid: string, gameName: string, tagLine: string, discordUserId: string) {
    try {
      const matchIds = await this.tftApi.getMatchIdsByPuuid(puuid, 1);
      console.log(`[TFT Tracker] ${gameName}#${tagLine} has ${matchIds.length} recent TFT matches`);

      if (matchIds.length === 0) return;

      const latestMatchId = matchIds[0];
      const trackedGame = db.getTrackedTFTGame(latestMatchId);

      console.log(`[TFT Tracker] Latest match ID: ${latestMatchId}, Already notified: ${trackedGame?.notifiedEnd ? 'YES' : 'NO'}`);

      // If this match hasn't been notified yet
      if (!trackedGame || !trackedGame.notifiedEnd) {
        const match = await this.tftApi.getMatchById(latestMatchId);
        if (!match) {
          console.log(`[TFT Tracker] Could not fetch match data for ${latestMatchId}`);
          return;
        }

        console.log(`[TFT Tracker] Match queue ID: ${match.info.queue_id}, Is ranked: ${this.tftApi.isRankedTFTQueue(match.info.queue_id)}`);

        // Only notify ranked games
        if (!this.tftApi.isRankedTFTQueue(match.info.queue_id)) {
          console.log(`[TFT Tracker] Skipping non-ranked queue ${match.info.queue_id}`);
          return;
        }

        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (!participant) {
          console.log(`[TFT Tracker] Could not find participant in match`);
          return;
        }

        // Get current LP
        const leagueEntries = await this.tftApi.getLeagueEntries(puuid);
        const queueType = this.tftApi.getQueueTypeFromQueueId(match.info.queue_id);
        const leagueEntry = leagueEntries.find(e => e.queueType === queueType);

        const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
        if (!channel) return;

        const embed = createTFTGameEndEmbed(
          gameName,
          tagLine,
          participant,
          match.info.game_length,
          this.tftApi.getQueueName(match.info.queue_id),
          leagueEntry,
          discordUserId,
          trackedGame?.lpBefore || undefined
        );
        await channel.send({ embeds: [embed] });

        // Mark as notified
        if (!trackedGame) {
          db.addTrackedTFTGame(accountId, latestMatchId, match.info.game_datetime);
        }
        db.markTFTGameNotifiedEnd(latestMatchId);

        // Save league snapshot
        if (leagueEntry) {
          db.saveTFTLeagueSnapshot(
            accountId,
            queueType,
            leagueEntry.tier,
            leagueEntry.rank,
            leagueEntry.leaguePoints,
            leagueEntry.wins,
            leagueEntry.losses
          );
        }

        console.log(`Notified TFT game end for ${gameName}#${tagLine} - Placement: ${participant.placement}`);
      }
    } catch (error) {
      console.error('Error checking recent TFT matches:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default TFTGameTracker;
export { TFTGameTracker };
