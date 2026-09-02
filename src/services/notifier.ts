import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  TextBasedChannel
} from 'discord.js';
import { createLogger } from '../core/logger';

const log = createLogger('notifier');

/**
 * Sends embeds to a configured channel.
 *
 * Resolves and caches the channel, and never lets a Discord failure take down a
 * tracker cycle — a missing channel is logged once, not thrown.
 */
export class Notifier {
  private channel: TextBasedChannel | null = null;
  private lastResolveFailureLoggedAt = 0;

  constructor(
    private readonly client: Client,
    private readonly channelId: string,
    private readonly label: string
  ) {}

  private async resolveChannel(): Promise<TextBasedChannel | null> {
    if (this.channel) return this.channel;

    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (!channel) throw new Error('Salon introuvable');
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement &&
        channel.type !== ChannelType.PublicThread &&
        channel.type !== ChannelType.PrivateThread
      ) {
        throw new Error(`Le salon ${this.channelId} n’est pas un salon textuel`);
      }
      this.channel = channel;
      log.info(`Salon ${this.label} résolu`, { channelId: this.channelId });
      return channel;
    } catch (error) {
      // Throttle the log: a misconfigured channel would otherwise spam once a minute.
      if (Date.now() - this.lastResolveFailureLoggedAt > 10 * 60 * 1000) {
        this.lastResolveFailureLoggedAt = Date.now();
        log.error(`Impossible de résoudre le salon ${this.label}`, {
          channelId: this.channelId,
          error: String(error)
        });
      }
      return null;
    }
  }

  async send(
    embed: EmbedBuilder,
    components: ActionRowBuilder<ButtonBuilder>[] = []
  ): Promise<boolean> {
    const channel = await this.resolveChannel();
    if (!channel || !channel.isSendable()) return false;

    try {
      await channel.send({ embeds: [embed], components });
      return true;
    } catch (error) {
      log.error('Échec d’envoi du message', { channelId: this.channelId, error: String(error) });
      // Force a re-resolve next time: permissions or the channel itself may have changed.
      this.channel = null;
      return false;
    }
  }
}
