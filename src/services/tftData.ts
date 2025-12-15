import axios from 'axios';

interface TFTChampion {
  name: string;
  cost: number;
  traits: string[];
}

interface TFTItem {
  id: number;
  name: string;
  icon: string;
}

interface TFTTrait {
  name: string;
  description: string;
  effects: Array<{
    minUnits: number;
    maxUnits: number;
    style: number;
  }>;
}

class TFTDataService {
  private champions: Map<string, TFTChampion> = new Map();
  private items: Map<number, TFTItem> = new Map();
  private traits: Map<string, TFTTrait> = new Map();
  private version: string = '';
  private cdnBaseUrl: string = 'https://ddragon.leagueoflegends.com/cdn';

  async initialize() {
    try {
      console.log('Loading TFT data...');

      // Get latest version
      const versionsResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
      this.version = versionsResponse.data[0];

      console.log(`TFT Data Dragon version: ${this.version}`);

      // Load TFT champions
      const championsResponse = await axios.get(
        `${this.cdnBaseUrl}/${this.version}/data/en_US/tft-champion.json`
      );

      for (const [key, champion] of Object.entries<any>(championsResponse.data.data)) {
        this.champions.set(key, {
          name: champion.name,
          cost: champion.cost,
          traits: champion.traits || []
        });
      }

      // Load TFT items
      const itemsResponse = await axios.get(
        `${this.cdnBaseUrl}/${this.version}/data/en_US/tft-item.json`
      );

      for (const [key, item] of Object.entries<any>(itemsResponse.data.data)) {
        const itemId = parseInt(key.replace('TFT_Item_', '').replace('TFT', ''));
        this.items.set(itemId, {
          id: itemId,
          name: item.name,
          icon: `${this.cdnBaseUrl}/${this.version}/img/tft-item/${item.image.full}`
        });
      }

      // Load TFT traits
      const traitsResponse = await axios.get(
        `${this.cdnBaseUrl}/${this.version}/data/en_US/tft-trait.json`
      );

      for (const [key, trait] of Object.entries<any>(traitsResponse.data.data)) {
        this.traits.set(key, {
          name: trait.name,
          description: trait.description,
          effects: trait.effects || []
        });
      }

      console.log(`✅ Loaded ${this.champions.size} TFT champions`);
      console.log(`✅ Loaded ${this.items.size} TFT items`);
      console.log(`✅ Loaded ${this.traits.size} TFT traits`);
    } catch (error) {
      console.error('Error loading TFT data:', error);
    }
  }

  getChampionName(championId: string): string {
    const champion = this.champions.get(championId);
    return champion ? champion.name : championId;
  }

  getChampionCost(championId: string): number {
    const champion = this.champions.get(championId);
    return champion ? champion.cost : 0;
  }

  getChampionTraits(championId: string): string[] {
    const champion = this.champions.get(championId);
    return champion ? champion.traits : [];
  }

  getChampionIcon(championId: string): string {
    return `${this.cdnBaseUrl}/${this.version}/img/tft-champion/${championId}.png`;
  }

  getItemName(itemId: number): string {
    const item = this.items.get(itemId);
    return item ? item.name : `Item ${itemId}`;
  }

  getItemIcon(itemId: number): string {
    const item = this.items.get(itemId);
    return item ? item.icon : '';
  }

  getTraitName(traitKey: string): string {
    const trait = this.traits.get(traitKey);
    return trait ? trait.name : traitKey;
  }

  getTraitStyle(traitKey: string, numUnits: number): number {
    const trait = this.traits.get(traitKey);
    if (!trait) return 0;

    for (const effect of trait.effects) {
      if (numUnits >= effect.minUnits && numUnits <= effect.maxUnits) {
        return effect.style;
      }
    }
    return 0;
  }

  getTraitIcon(traitKey: string): string {
    return `${this.cdnBaseUrl}/${this.version}/img/tft-trait/${traitKey}.png`;
  }
}

const tftData = new TFTDataService();
export { tftData, TFTDataService };
