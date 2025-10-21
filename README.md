# In-Game Tracker - Discord Bot

Bot Discord pour tracker automatiquement les parties League of Legends de ton serveur.

## 🎯 Fonctionnalités

- ✅ Enregistrement de plusieurs comptes LoL par utilisateur Discord
- 🎮 Notifications automatiques lors du début d'une partie (Ranked Solo/Duo & Flex)
- 📊 Notifications de fin de partie avec KDA, résultat, et LP gagné/perdu
- 📅 Récapitulatif quotidien à 8h du matin des gains/pertes de LP des dernières 24h
- 🔍 Commande `/stats` pour voir ses comptes enregistrés et son classement

## 📋 Prérequis

- Node.js v18 ou supérieur
- Un bot Discord ([créer un bot](https://discord.com/developers/applications))
- Une clé API Riot Games ([obtenir une clé](https://developer.riotgames.com/))

## 🚀 Installation

1. **Clone le projet**
```bash
git clone <url-du-repo>
cd in-game-tracker
```

2. **Installe les dépendances**
```bash
npm install
```

3. **Configure les variables d'environnement**

Crée un fichier `.env` à la racine du projet :

```env
# Discord Bot Token (depuis https://discord.com/developers/applications)
DISCORD_TOKEN=ton_token_discord

# Discord Client ID (Application ID)
DISCORD_CLIENT_ID=ton_client_id

# Discord Server ID (clic droit sur ton serveur > Copier l'identifiant)
DISCORD_GUILD_ID=ton_server_id

# Riot Games API Key (depuis https://developer.riotgames.com/)
RIOT_API_KEY=ta_clé_api_riot

# Channel ID pour les notifications (clic droit sur le canal > Copier l'identifiant)
NOTIFICATION_CHANNEL_ID=ton_channel_id

# Intervalle de vérification en secondes (60 = 1 minute)
TRACKING_INTERVAL=60
```

4. **Configure ton bot Discord**

Sur le [portail développeur Discord](https://discord.com/developers/applications) :
- Va dans "Bot" → Active "MESSAGE CONTENT INTENT"
- Va dans "OAuth2" → "URL Generator"
- Sélectionne les scopes : `bot`, `applications.commands`
- Permissions : `Send Messages`, `Embed Links`, `Read Message History`
- Utilise l'URL générée pour inviter le bot sur ton serveur

5. **Compile et lance le bot**

```bash
# Compilation TypeScript
npm run build

# Lancement du bot
npm start

# Ou pour le développement (avec rechargement auto)
npm run dev
```

## 📝 Commandes Discord

### `/register <riot-id>`
Enregistre ton compte LoL pour le tracking.
- **Exemple :** `/register Faker#KR1`
- Tu peux enregistrer plusieurs comptes

### `/unregister <riot-id>`
Supprime un compte du tracking.
- **Exemple :** `/unregister Faker#KR1`

### `/stats`
Affiche tes comptes enregistrés et leurs statistiques ranked.
- Montre le niveau, classement Solo/Duo et Flex, winrate

## 🔧 Structure du projet

```
in-game-tracker/
├── src/
│   ├── commands/          # Commandes slash Discord
│   │   ├── register.ts    # Commande /register
│   │   ├── unregister.ts  # Commande /unregister
│   │   └── stats.ts       # Commande /stats
│   ├── services/          # Services métier
│   │   ├── riotApi.ts     # Gestion API Riot Games
│   │   ├── tracker.ts     # Système de tracking des parties
│   │   └── dailyRecap.ts  # Récapitulatif quotidien
│   ├── database/          # Gestion base de données SQLite
│   │   └── index.ts       # Manager de la base de données
│   ├── utils/             # Utilitaires
│   │   └── embeds.ts      # Création des embeds Discord
│   ├── types/             # Types TypeScript
│   │   └── index.ts       # Définitions de types
│   └── index.ts           # Point d'entrée principal
├── package.json           # Dépendances npm
├── tsconfig.json          # Configuration TypeScript
└── .env                   # Variables d'environnement
```

## 🎮 Comment ça fonctionne ?

1. **Tracking automatique** : Le bot vérifie toutes les 60 secondes (configurable) si les joueurs enregistrés sont en partie
2. **Début de partie** : Envoie un embed avec le champion et le mode de jeu
3. **Fin de partie** : Envoie un embed détaillé avec KDA, durée, résultat, LP
4. **Récap quotidien** : À 8h, résume les performances des dernières 24h pour tous les joueurs

## 📊 Base de données

Le bot utilise SQLite avec 3 tables :
- `accounts` : Comptes LoL enregistrés
- `tracked_games` : Historique des parties trackées
- `league_snapshots` : Snapshots du classement pour le récap quotidien

## ⚠️ Limitations

- La clé API Riot gratuite a des limites de requêtes (20 req/sec, 100 req/2min)
- Le bot ne track que les parties classées (Solo/Duo et Flex)
- Les données de champions sont simplifiées (tu peux améliorer avec Data Dragon)

## 🛠️ Améliorations possibles

- Ajouter Data Dragon pour les noms/images de champions
- Supporter d'autres régions que EUW
- Ajouter un système de profil avec graphiques
- Historique des parties avec filtres
- Notifications personnalisables par utilisateur
- Support des parties normales/ARAM

## 📄 Licence

MIT

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésite pas à ouvrir une issue ou une PR.