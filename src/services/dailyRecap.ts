import { Client, TextChannel } from 'discord.js';
import cron from 'node-cron';
import RiotApiService from './riotApi';
import { db } from '../database';
import { createDailyRecapEmbed } from '../utils/embeds';

class DailyRecapService {
  private client: Client;
  private riotApi: RiotApiService;
  private channelId: string;

  constructor(client: Client, riotApi: RiotApiService, channelId: string) {
    this.client = client;
    this.riotApi = riotApi;
    this.channelId = channelId;
  }

  start() {
    // Schedule daily recap at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('Running daily recap...');
      await this.sendDailyRecap();
    });

    console.log('Daily recap service started (scheduled for 8:00 AM)');
  }

  async sendDailyRecap() {
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) {
        console.error('Notification channel not found');
        return;
      }

      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

      const accounts = db.getAllAccounts();
      const recapData: Array<{
        gameName: string;
        tagLine: string;
        discordUserId: string;
        queueType: string;
        lpChange: number;
        oldRank: string;
        newRank: string;
        wins: number;
        losses: number;
      }> = [];

      for (const account of accounts) {
        const currentLeagueEntries = await this.riotApi.getLeagueEntries(account.puuid);
        
        // Check both Solo/Duo and Flex queues
        for (const queueType of ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']) {
          const currentEntry = currentLeagueEntries.find(e => e.queueType === queueType);
          if (!currentEntry) continue;

          // Get snapshots from last 24 hours
          const snapshots = db.getLeagueSnapshotsBetween(account.id, twentyFourHoursAgo, now);
          const queueSnapshots = snapshots.filter((s: any) => s.queue_type === queueType);

          if (queueSnapshots.length === 0) continue;

          // Get oldest snapshot in the last 24 hours
          const oldestSnapshot = queueSnapshots[queueSnapshots.length - 1];
          
          // Calculate LP change considering rank changes
          let lpChange = 0;
          const oldTier = oldestSnapshot.tier;
          const oldRank = oldestSnapshot.rank;
          const newTier = currentEntry.tier;
          const newRank = currentEntry.rank;

          // Rank order for comparison
          const tierOrder: { [key: string]: number } = {
            'IRON': 0, 'BRONZE': 1, 'SILVER': 2, 'GOLD': 3,
            'PLATINUM': 4, 'EMERALD': 5, 'DIAMOND': 6,
            'MASTER': 7, 'GRANDMASTER': 8, 'CHALLENGER': 9
          };

          const rankOrder: { [key: string]: number } = {
            'IV': 0, 'III': 1, 'II': 2, 'I': 3
          };

          const oldTierValue = tierOrder[oldTier] || 0;
          const newTierValue = tierOrder[newTier] || 0;
          const oldRankValue = rankOrder[oldRank] || 0;
          const newRankValue = rankOrder[newRank] || 0;

          // Check if rank changed
          const rankChanged = oldTierValue !== newTierValue || oldRankValue !== newRankValue;

          if (rankChanged) {
            // Rank changed - estimate LP change
            if (newTierValue > oldTierValue || (newTierValue === oldTierValue && newRankValue > oldRankValue)) {
              // Promotion
              const divisionsGained = (newTierValue - oldTierValue) * 4 + (newRankValue - oldRankValue);
              lpChange = (100 - oldestSnapshot.league_points) + currentEntry.leaguePoints + (divisionsGained - 1) * 100;
            } else {
              // Demotion
              const divisionsLost = (oldTierValue - newTierValue) * 4 + (oldRankValue - newRankValue);
              lpChange = -(oldestSnapshot.league_points + (100 - currentEntry.leaguePoints) + (divisionsLost - 1) * 100);
            }
          } else {
            // Same rank, simple LP difference
            lpChange = currentEntry.leaguePoints - oldestSnapshot.league_points;
          }

          const wins = currentEntry.wins - oldestSnapshot.wins;
          const losses = currentEntry.losses - oldestSnapshot.losses;

          // Only include if there were games played
          if (wins > 0 || losses > 0) {
            const oldRankStr = `${oldestSnapshot.tier} ${oldestSnapshot.rank}`;
            const newRankStr = `${currentEntry.tier} ${currentEntry.rank}`;

            recapData.push({
              gameName: account.gameName,
              tagLine: account.tagLine,
              discordUserId: account.discordUserId,
              queueType,
              lpChange,
              oldRank: oldRankStr,
              newRank: newRankStr,
              wins,
              losses
            });
          }
        }

        // Rate limiting
        await this.sleep(1000);
      }

      if (recapData.length > 0) {
        // Send recap embed
        const embed = createDailyRecapEmbed(recapData);
        await channel.send({ embeds: [embed] });

        console.log('Daily recap sent successfully');
      } else {
        console.log('No games played in the last 24 hours, skipping recap');
      }
    } catch (error) {
      console.error('Error sending daily recap:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DailyRecapService;
export { DailyRecapService };