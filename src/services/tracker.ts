import { Client, TextChannel } from 'discord.js';
import RiotApiService from './riotApi';
import { db } from '../database';
import { createGameStartEmbed, createGameEndEmbed, createGroupGameStartEmbed, createGroupGameEndEmbed } from '../utils/embeds';

interface GameGroup {
  gameId: string;
  queueId: number;
  queueName: string;
  players: Array<{
    accountId: number;
    puuid: string;
    gameName: string;
    tagLine: string;
    discordUserId: string;
    championId: number;
    leagueEntry: any;
  }>;
}

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
    const gameGroups = new Map<string, GameGroup>();
    const processedAccounts = new Set<number>();

    // First pass: collect all active games and group players
    for (const account of accounts) {
      if (processedAccounts.has(account.id)) continue;

      try {
        const activeGame = await this.riotApi.getActiveGame(account.puuid);
        
        if (activeGame && this.riotApi.isRankedQueue(activeGame.gameQueueConfigId)) {
          const gameId = `${activeGame.platformId}_${activeGame.gameId}`;
          const participant = activeGame.participants.find((p: any) => p.puuid === account.puuid);
          
          if (!participant) continue;

          // Get current LP before the game
          const leagueEntries = await this.riotApi.getLeagueEntries(account.puuid);
          const queueType = activeGame.gameQueueConfigId === 420 ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
          const leagueEntry = leagueEntries.find(e => e.queueType === queueType);

          // Check if this is a new game for this account
          const isNewGame = !this.activeGames.has(account.id) || this.activeGames.get(account.id) !== gameId;

          if (!gameGroups.has(gameId)) {
            gameGroups.set(gameId, {
              gameId,
              queueId: activeGame.gameQueueConfigId,
              queueName: this.riotApi.getQueueName(activeGame.gameQueueConfigId),
              players: []
            });
          }

          // Only add to group if it's a new game for this account
          if (isNewGame) {
            gameGroups.get(gameId)!.players.push({
              accountId: account.id,
              puuid: account.puuid,
              gameName: account.gameName,
              tagLine: account.tagLine,
              discordUserId: account.discordUserId,
              championId: participant.championId,
              leagueEntry
            });

            this.activeGames.set(account.id, gameId);
            processedAccounts.add(account.id);
          }
        } else {
          // Player not in game, check if they just finished a game
          if (this.activeGames.has(account.id)) {
            const oldGameId = this.activeGames.get(account.id)!;
            this.activeGames.delete(account.id);
            
            // Wait a bit for match data to be available
            await this.sleep(5000);
            await this.checkRecentMatches(account.id, account.puuid, account.gameName, account.tagLine, account.discordUserId);
          }
        }

        await this.sleep(1000); // Rate limiting
      } catch (error) {
        console.error(`Error checking account ${account.gameName}#${account.tagLine}:`, error);
      }
    }

    // Second pass: notify grouped games
    for (const [gameId, group] of gameGroups) {
      if (group.players.length > 0) {
        await this.notifyGameStartGrouped(group);
      }
    }
  }

  private async notifyGameStartGrouped(group: GameGroup) {
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) return;

      // Create appropriate embed based on number of players
      const embed = group.players.length === 1
        ? createGameStartEmbed(
            group.players[0].gameName,
            group.players[0].tagLine,
            group.players[0].championId,
            group.queueName,
            group.players[0].discordUserId
          )
        : createGroupGameStartEmbed(group.players, group.queueName);

      await channel.send({ embeds: [embed] });

      // Store game data and snapshots for all players
      for (const player of group.players) {
        db.addTrackedGame(
          player.accountId,
          group.gameId,
          Date.now(),
          player.leagueEntry?.leaguePoints,
          player.leagueEntry?.tier,
          player.leagueEntry?.rank
        );
        db.markGameNotifiedStart(player.accountId, group.gameId);

        // Save league snapshot before the game
        if (player.leagueEntry) {
          const queueType = group.queueId === 420 ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
          db.saveLeagueSnapshot(
            player.accountId,
            queueType,
            player.leagueEntry.tier,
            player.leagueEntry.rank,
            player.leagueEntry.leaguePoints,
            player.leagueEntry.wins,
            player.leagueEntry.losses
          );
        }

        console.log(`Notified game start for ${player.gameName}#${player.tagLine}`);
      }
    } catch (error) {
      console.error('Error notifying game start:', error);
    }
  }

  private async checkRecentMatches(accountId: number, puuid: string, gameName: string, tagLine: string, discordUserId: string) {
    try {
      const matchIds = await this.riotApi.getMatchIdsByPuuidAllQueues(puuid, 1);
      
      if (matchIds.length === 0) return;

      const latestMatchId = matchIds[0];
      const trackedGame = db.getTrackedGame(accountId, latestMatchId);

      // If this match hasn't been notified yet
      if (!trackedGame || !trackedGame.notifiedEnd) {
        const match = await this.riotApi.getMatchById(latestMatchId);
        if (!match) return;

        // Only notify ranked games
        if (!this.riotApi.isRankedQueue(match.info.queueId)) return;

        const participant = match.info.participants.find(p => p.puuid === puuid);
        if (!participant) return;

        // Get current LP after the game
        const leagueEntries = await this.riotApi.getLeagueEntries(puuid);
        const queueType = match.info.queueId === 420 ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
        const leagueEntry = leagueEntries.find(e => e.queueType === queueType);

        // Check if other tracked players are in this game
        const allParticipants = match.info.participants;
        const trackedPlayers = [];
        
        for (const p of allParticipants) {
          const accounts = db.getAllAccounts();
          const trackedAccount = accounts.find(acc => acc.puuid === p.puuid);
          
          if (trackedAccount && !db.getTrackedGame(trackedAccount.id, latestMatchId)?.notifiedEnd) {
            // Get their league entry
            const pLeagueEntries = await this.riotApi.getLeagueEntries(trackedAccount.puuid);
            const pLeagueEntry = pLeagueEntries.find(e => e.queueType === queueType);
            const pTrackedGame = db.getTrackedGame(trackedAccount.id, latestMatchId);
            
            trackedPlayers.push({
              gameName: trackedAccount.gameName,
              tagLine: trackedAccount.tagLine,
              discordUserId: trackedAccount.discordUserId,
              participant: p,
              leagueEntry: pLeagueEntry,
              previousLP: pTrackedGame?.lpBefore,
              accountId: trackedAccount.id
            });
          }
        }

        const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
        if (!channel) return;

        // Create embed based on number of tracked players
        const embed = trackedPlayers.length === 0
          ? createGameEndEmbed(
              gameName,
              tagLine,
              participant,
              match.info.gameDuration,
              this.riotApi.getQueueName(match.info.queueId),
              leagueEntry,
              discordUserId,
              trackedGame?.lpBefore,
              trackedGame?.tierBefore,
              trackedGame?.rankBefore
            )
          : createGroupGameEndEmbed(
              trackedPlayers,
              match.info.gameDuration,
              this.riotApi.getQueueName(match.info.queueId)
            );

        await channel.send({ embeds: [embed] });

        // Mark all tracked players as notified and save snapshots
        for (const player of trackedPlayers) {
          if (!db.getTrackedGame(player.accountId, latestMatchId)) {
            db.addTrackedGame(player.accountId, latestMatchId, match.info.gameCreation);
          }
          db.markGameNotifiedEnd(player.accountId, latestMatchId);

          // Save league snapshot after the game
          if (player.leagueEntry) {
            db.saveLeagueSnapshot(
              player.accountId,
              queueType,
              player.leagueEntry.tier,
              player.leagueEntry.rank,
              player.leagueEntry.leaguePoints,
              player.leagueEntry.wins,
              player.leagueEntry.losses
            );
          }

          console.log(`Notified game end for ${player.gameName}#${player.tagLine}`);
        }

        // Mark original player as notified if not in trackedPlayers
        if (!trackedPlayers.some(p => p.accountId === accountId)) {
          if (!trackedGame) {
            db.addTrackedGame(accountId, latestMatchId, match.info.gameCreation);
          }
          db.markGameNotifiedEnd(accountId, latestMatchId);

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