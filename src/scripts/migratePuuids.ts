import dotenv from 'dotenv';
import { db } from '../database';
import RiotApiService from '../services/riotApi';

dotenv.config();

async function migratePuuids() {
  console.log('🔄 Starting PUUID migration...');

  await db.initialize();
  const riotApi = new RiotApiService(process.env.RIOT_API_KEY!);

  const accounts = db.getAllAccounts();
  console.log(`Found ${accounts.length} accounts to migrate`);

  let successCount = 0;
  let failCount = 0;

  for (const account of accounts) {
    try {
      console.log(`Migrating ${account.gameName}#${account.tagLine}...`);

      // Fetch fresh account data with new API key
      const freshAccount = await riotApi.getAccountByRiotId(account.gameName, account.tagLine);

      if (!freshAccount) {
        console.error(`❌ Could not fetch account: ${account.gameName}#${account.tagLine}`);
        failCount++;
        continue;
      }

      // Update PUUID in database
      // We need to add this method to the database
      console.log(`Updating PUUID for ${account.gameName}#${account.tagLine}`);
      console.log(`  Old PUUID: ${account.puuid.substring(0, 20)}...`);
      console.log(`  New PUUID: ${freshAccount.puuid.substring(0, 20)}...`);

      // Direct SQL update
      const stmt = (db as any).db.prepare(
        'UPDATE accounts SET puuid = ? WHERE id = ?'
      );
      stmt.bind([freshAccount.puuid, account.id]);
      stmt.step();
      stmt.free();
      (db as any).save();

      successCount++;
      console.log(`✅ Updated ${account.gameName}#${account.tagLine}`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Error migrating ${account.gameName}#${account.tagLine}:`, error);
      failCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📝 Total: ${accounts.length}`);

  db.close();
}

migratePuuids().catch(console.error);
