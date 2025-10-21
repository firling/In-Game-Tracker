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
          
          const lpChange = currentEntry.leaguePoints - oldestSnapshot.league_points;
          const wins = currentEntry.wins - oldestSnapshot.wins;
          const losses = currentEntry.losses - oldestSnapshot.losses;

          // Only include if there were games played
          if (wins > 0 || losses > 0) {
            const oldRank = `${oldestSnapshot.tier} ${oldestSnapshot.rank}`;
            const newRank = `${currentEntry.tier} ${currentEntry.rank}`;

            recapData.push({
              gameName: account.gameName,
              tagLine: account.tagLine,
              discordUserId: account.discordUserId,
              queueType,
              lpChange,
              oldRank,
              newRank,
              wins,
              losses
            });
          }
        }

        // Rate limiting
        await this.sleep(1000);
      }

      // Send recap embed
      const embed = createDailyRecapEmbed(recapData);
      await channel.send({ embeds: [embed] });

      console.log('Daily recap sent successfully');
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