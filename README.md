# In-Game Tracker

Bot Discord qui suit les parties classées **League of Legends** (et **TFT**, optionnel) des membres de ton serveur, et publie automatiquement le début et la fin de chaque partie avec le KDA, le farm et les LP gagnés ou perdus.

---

## Fonctionnalités

- **Annonce de début de partie** — champion, rang actuel, bilan de la saison, lien *spectate*.
- **Annonce de fin de partie** — victoire / défaite / remake, KDA, CS par minute, dégâts, vision, variation de LP et barre de progression dans la division.
- **Annonces groupées** — quand plusieurs membres jouent ensemble, une seule annonce. S'ils s'affrontent, l'embed sépare les deux camps.
- **Promotions et rétrogradations** mises en avant en tête d'annonce.
- **Récapitulatif automatique** quotidien, plus `/recap` à la demande sur 24 h, 7 ou 30 jours.
- **Classements** par rang ou par LP gagnés sur une période.
- **Historique** des parties suivies, stocké localement.
- **Rotation de la clé API Riot** en une commande, sans redémarrage ni perte de données.

### Ce que le bot ne fait pas

- Il ne suit que les files **Classée Solo/Duo** et **Classée Flex** (normales, ARAM et Arena sont ignorées).
- L'historique ne contient que les parties observées en direct par le bot : rien n'est importé rétroactivement.

---

## Commandes

| Commande | Description |
|---|---|
| `/register <riot-id> [membre] [serveur]` | Enregistre un compte (`Faker#KR1`). Avec `membre`, le compte est lié à **quelqu'un d'autre** : c'est lui qui sera mentionné. Jusqu'à 8 comptes par membre. |
| `/unregister <compte>` | Retire un compte du suivi (autocomplétion sur les comptes que tu peux retirer). |
| `/profile [membre] [public]` | Rangs, LP et winrate des comptes suivis. |
| `/history [membre] [nombre] [public]` | Les dernières parties suivies, avec LP et KDA. |
| `/leaderboard [type]` | Classement du serveur : par rang (Solo/Duo, Flex) ou par LP gagnés (24 h, 7 j, 30 j). |
| `/recap [periode]` | Bilan collectif sur 24 h, 7 ou 30 jours. |
| `/status` | État de santé du bot *(administrateurs)*. |
| `/apikey <cle>` | Renouvelle la clé API Riot *(administrateurs)*. |
| `/help` | Aide intégrée. |

Les commandes de consultation répondent en privé par défaut ; ajoute `public: true` pour partager la réponse dans le salon.

### Enregistrer le compte d'un autre membre

`/register Pote#EUW membre:@Pote` lie le compte à `@Pote` : c'est **lui** qui sera mentionné à chaque annonce, pas celui qui a lancé la commande.

Trois garde-fous, pour que personne ne se retrouve tagué à son insu :

- la confirmation est **publique** et mentionne la personne concernée, au lieu d'être discrète ;
- **elle peut la retirer elle-même** avec `/unregister`, sans passer par un administrateur ;
- **celui qui a fait l'ajout peut aussi le défaire**, ce qui règle le cas du mauvais Riot ID.

Le quota de 8 comptes s'applique au propriétaire du compte, pas à celui qui l'ajoute. `/profile` indique « lié par @… » quand un compte n'a pas été ajouté par son propriétaire.

---

## Installation

### Prérequis

- Node.js 20+ (ou Docker)
- Un bot Discord — [portail développeur](https://discord.com/developers/applications)
- Une clé API Riot — [developer.riotgames.com](https://developer.riotgames.com/)

### Configuration du bot Discord

1. **Bot** → *Reset Token* pour récupérer `DISCORD_TOKEN`.
2. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`.
3. Permissions : `Send Messages`, `Embed Links`, `Use External Emojis`, `Read Message History`.
4. Invite le bot, puis récupère l'ID du salon d'annonces (clic droit → *Copier l'identifiant*, mode développeur activé).

Aucun *privileged intent* n'est nécessaire : le bot n'utilise que `Guilds`.

### Démarrage

```bash
cp .env.example .env   # puis renseigne les variables
yarn install
yarn build
yarn start
```

En développement : `yarn dev` (TypeScript à la volée), `yarn test`, `yarn typecheck`.

### Docker

```bash
cp .env.example .env   # puis renseigne les variables
docker compose up -d --build
docker compose logs -f
```

La base SQLite est montée dans `./data` et survit aux reconstructions. Le conteneur expose `/health` sur le port 3000 et est marqué *unhealthy* si Discord est déconnecté ou si la clé Riot est rejetée.

---

## Configuration

Toutes les variables sont documentées dans [`.env.example`](.env.example). Les principales :

| Variable | Défaut | Rôle |
|---|---|---|
| `DISCORD_TOKEN` | — | **Requis.** Token du bot. |
| `DISCORD_CLIENT_ID` | — | **Requis.** Application ID. |
| `DISCORD_GUILD_ID` | — | Publication instantanée des commandes sur ce serveur. Vide → publication globale (≈ 1 h). |
| `NOTIFICATION_CHANNEL_ID` | — | **Requis.** Salon des annonces. |
| `RIOT_API_KEY` | — | **Requis.** Clé de démarrage ; `/apikey` la remplace ensuite en base. |
| `RIOT_PLATFORM` | `euw1` | Serveur Riot (`euw1`, `na1`, `kr`, `br1`…). |
| `RIOT_KEY_TIER` | `development` | Budget **initial** du limiteur. Corrigé automatiquement dès la première réponse de Riot. |
| `TRACKING_INTERVAL` | `60` | Secondes entre deux vérifications. |
| `TFT_ENABLED` | `false` | Active le suivi TFT. |
| `DAILY_RECAP_CRON` | `0 8 * * *` | Horaire du récap quotidien. |
| `ADMIN_USER_IDS` | — | IDs autorisés sur `/apikey` et `/status`, en plus des administrateurs du serveur. |
| `HEALTH_PORT` | `3000` | Endpoint `/health`. `0` pour le désactiver. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |

### Clé API Riot

Une clé de **développement** expire toutes les 24 h. Quand elle expire, le bot cesse silencieusement de voir les parties. Deux réflexes :

- `/status` indique si la clé est encore acceptée ;
- `/apikey RGAPI-…` la remplace **à chaud** — la clé est validée auprès de Riot avant d'être acceptée, puis stockée en base, donc elle survit à un redémarrage du conteneur.

Attention à ne pas confondre deux choses distinctes :

- **l'expiration** — une clé de *développement* meurt au bout de 24 h ; une clé *personnelle* ou de *production* est permanente ;
- **le débit** — une clé personnelle garde le budget d'une clé de dev (20 req/s, 100 req/2 min) ; seule une clé de *production* passe à 500 req/10 s.

`RIOT_KEY_TIER` n'est qu'une valeur de départ : le limiteur adopte le quota réel annoncé par Riot dans l'en-tête `X-App-Rate-Limit` dès la première réponse, et `/status` affiche le quota effectivement appliqué. Un `RIOT_KEY_TIER` mal réglé se corrige donc tout seul.

---

## Architecture

```
src/
├── commands/     Commandes slash (une par fichier) + registre
├── config/       Lecture et validation de l'environnement
├── core/         Logger, cache TTL, utilitaires asynchrones
├── db/           Connexion SQLite, migrations versionnées, dépôts
├── domain/       Arithmétique des rangs (LP absolus, promotions)
├── riot/         Client HTTP, limiteur de débit, endpoints LoL/TFT, Data Dragon
├── services/     Notifications Discord, récap, endpoint de santé
├── trackers/     Boucles de suivi LoL et TFT
└── ui/           Thème, formatage, embeds, composants
```

Quelques partis pris qui expliquent le reste :

- **Tout l'état vit en base**, jamais en mémoire. Un redémarrage en pleine partie ne provoque ni double annonce ni annonce perdue : la partie est reprise et son résultat publié.
- **La fin de partie est détectée en interrogeant le match directement** (`match-v5/{matchId}`), pas en devinant à partir de l'historique. Un match encore en cours répond 404 ; dès qu'il répond, le résultat est publié.
- **Les LP sont projetés sur un axe absolu** (`tier × 400 + division × 100 + LP`) avant d'être soustraits. C'est ce qui rend correct le calcul d'un `Or I 92 LP → Platine IV 10 LP` (+18), là où une soustraction naïve donnerait −82. Les tiers apex (Maître, Grand Maître, Challenger) partagent le même plancher.
- **Le limiteur de débit reproduit les fenêtres de Riot** et apprend les quotas réels via les en-têtes `X-App-Rate-Limit` et `X-Method-Rate-Limit` : la configuration n'est qu'une amorce, corrigée dès la première réponse sans perdre le compte des requêtes déjà émises. Un 429 met en pause l'application ou la seule méthode concernée selon `X-Rate-Limit-Type`.
- **SQLite en mode WAL** via `better-sqlite3` : écritures atomiques et transactionnelles, base intacte même après un `docker kill`.

### Base de données

| Table | Contenu |
|---|---|
| `accounts` | Comptes Riot enregistrés, un PUUID ne peut être suivi qu'une fois. `registered_by` retient qui a lancé la commande. |
| `tracked_games` | Une ligne par joueur et par partie : état, rang avant/après, statistiques finales. |
| `league_snapshots` | Photos du classement, écrites uniquement en cas de changement. |
| `tracked_tft_games`, `tft_league_snapshots` | Équivalents TFT. |
| `settings` | Configuration modifiable à chaud (clé API). |
| `schema_migrations` | Migrations appliquées. |

Les migrations sont versionnées et jouées automatiquement au démarrage, chacune dans sa transaction.

---

## Tests

```bash
yarn test
```

71 tests couvrent l'arithmétique des rangs (promotions, rétrogradations, tiers apex), les dépôts SQLite (unicité, cascade, agrégations, comptes liés pour autrui), le limiteur de débit (fenêtres, 429, apprentissage des quotas applicatifs et par méthode), l'endpoint de santé et la génération des embeds — y compris le respect des limites de taille imposées par Discord.

---

## Licence

MIT
