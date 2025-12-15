#!/bin/bash

# Script pour migrer les PUUIDs dans Docker

echo "🔄 Starting PUUID migration in Docker..."

# Arrêter le bot
docker compose down

# Lancer le script de migration
docker compose run --rm bot npm run migrate-puuids

# Redémarrer le bot
docker compose up -d

echo "✅ Migration complete! Bot restarted."
