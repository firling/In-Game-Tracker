import axios from 'axios';
import { createLogger } from '../core/logger';

const log = createLogger('ddragon');

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface ChampionEntry {
  id: string;
  key: string;
  name: string;
}

/**
 * Static game data from Data Dragon: champion names and the image URLs used in
 * embeds. Loaded once at boot and refreshed twice a day so a new patch doesn't
 * require a restart. Failures are non-fatal — the bot degrades to raw IDs.
 */
class DataDragonService {
  private version = '';
  private byChampionId = new Map<number, ChampionEntry>();
  private byChampionSlug = new Map<string, ChampionEntry>();
  private refreshTimer: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    await this.refresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh().catch((error) => log.warn('Rafraîchissement Data Dragon échoué', error));
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private async refresh(): Promise<void> {
    const versions = await axios.get<string[]>(`${DDRAGON}/api/versions.json`, { timeout: 10_000 });
    const latest = versions.data[0];
    if (!latest) throw new Error('Aucune version Data Dragon retournée');

    if (latest === this.version && this.byChampionId.size > 0) return;

    const champions = await axios.get<{ data: Record<string, ChampionEntry> }>(
      `${DDRAGON}/cdn/${latest}/data/fr_FR/champion.json`,
      { timeout: 15_000 }
    );

    const byId = new Map<number, ChampionEntry>();
    const bySlug = new Map<string, ChampionEntry>();
    for (const entry of Object.values(champions.data.data)) {
      byId.set(Number.parseInt(entry.key, 10), entry);
      bySlug.set(entry.id.toLowerCase(), entry);
    }

    this.version = latest;
    this.byChampionId = byId;
    this.byChampionSlug = bySlug;
    log.info('Données Data Dragon chargées', { version: latest, champions: byId.size });
  }

  get ready(): boolean {
    return this.byChampionId.size > 0;
  }

  championName(championId: number | null | undefined): string {
    if (championId === null || championId === undefined) return 'Champion inconnu';
    return this.byChampionId.get(championId)?.name ?? `Champion ${championId}`;
  }

  /** Data Dragon addresses images by slug (`MonkeyKing`), not display name. */
  private slugFor(champion: number | string | null | undefined): string | null {
    if (champion === null || champion === undefined) return null;
    if (typeof champion === 'number') return this.byChampionId.get(champion)?.id ?? null;
    const direct = this.byChampionSlug.get(champion.toLowerCase());
    if (direct) return direct.id;
    // Match-v5 returns the slug already; trust it if we have no mapping yet.
    return champion;
  }

  championIconUrl(champion: number | string | null | undefined): string | null {
    const slug = this.slugFor(champion);
    if (!slug || !this.version) return null;
    return `${DDRAGON}/cdn/${this.version}/img/champion/${slug}.png`;
  }

  /** Full-width splash art, used as the banner of end-of-game embeds. */
  championSplashUrl(champion: number | string | null | undefined): string | null {
    const slug = this.slugFor(champion);
    if (!slug) return null;
    return `${DDRAGON}/cdn/img/champion/splash/${slug}_0.jpg`;
  }

  itemIconUrl(itemId: number): string | null {
    if (!itemId || !this.version) return null;
    return `${DDRAGON}/cdn/${this.version}/img/item/${itemId}.png`;
  }

  get currentVersion(): string {
    return this.version;
  }
}

export const dataDragon = new DataDragonService();
