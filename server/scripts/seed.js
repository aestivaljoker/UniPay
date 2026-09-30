/**
 * Seed / reset the JSON store from the command line.
 *   npm run seed     — seed only if empty
 *   npm run reset    — wipe and rebuild (same as the admin RESET DEMO button)
 */

import { resetDemoData, seedIfEmpty } from '../services/seedService.js';

const force = process.argv.includes('--force');

try {
  if (force) {
    const summary = await resetDemoData();
    console.log('[unipay] Demo data reset.');
    console.table(summary);
  } else {
    const result = await seedIfEmpty();
    console.log(
      result.seeded
        ? `[unipay] Seeded demo data (${result.students} students).`
        : `[unipay] Data already present (${result.students} students). Use "npm run reset" to force.`
    );
  }
  process.exit(0);
} catch (err) {
  console.error('[unipay] seed failed:', err);
  process.exit(1);
}
