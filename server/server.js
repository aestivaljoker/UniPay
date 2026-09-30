/**
 * UniPay server entry point.
 *
 * Binds 0.0.0.0 so Android phones on the same Wi-Fi can reach the laptop by its
 * LAN IP, and prints every reachable URL at boot so you can read one off the
 * screen and type it into a phone.
 */

import http from 'node:http';
import os from 'node:os';
import { createApp } from './app.js';
import { initRealtime } from './socket/realtime.js';
import { seedIfEmpty } from './services/seedService.js';

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push({ name, address: addr.address });
    }
  }
  return out;
}

async function main() {
  const seedResult = await seedIfEmpty();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server, { corsOrigin: true });

  server.listen(PORT, HOST, () => {
    const ips = lanAddresses();
    const line = '─'.repeat(58);

    console.log(`\n\x1b[36m${line}\x1b[0m`);
    console.log('  \x1b[1m\x1b[36mUNIPAY\x1b[0m  Your Campus. Your Wallet. One Tap.');
    console.log('  \x1b[33mDEMO MODE — all payments are SIMULATED\x1b[0m');
    console.log(`\x1b[36m${line}\x1b[0m`);
    console.log(
      seedResult.seeded
        ? `  Seeded demo data (${seedResult.students} students).`
        : `  Loaded existing data (${seedResult.students} students).`
    );
    console.log(`  API + Socket.IO listening on ${HOST}:${PORT}\n`);
    console.log('  \x1b[1mOpen on this laptop:\x1b[0m');
    console.log(`    http://localhost:${PORT}`);

    if (ips.length) {
      console.log('\n  \x1b[1mOpen on phones (same Wi-Fi):\x1b[0m');
      for (const { name, address } of ips) {
        console.log(`    http://${address}:${PORT}   \x1b[2m(${name})\x1b[0m`);
      }
      console.log(`\n  \x1b[2mDev front-end: set client/.env → VITE_API_URL=http://${ips[0].address}:${PORT}\x1b[0m`);
    } else {
      console.log('\n  \x1b[33m  No LAN address found — connect the laptop to Wi-Fi.\x1b[0m');
    }

    console.log(`\n  \x1b[2mDemo logins: devansh@unipay.demo / 123456 · canteen@unipay.demo / 123456`);
    console.log(`               admin@unipay.demo / admin123\x1b[0m`);
    console.log(`\x1b[36m${line}\x1b[0m\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[unipay] Port ${PORT} is already in use.`);
      console.error(`[unipay] Stop the other process, or start with a different port:\n`);
      console.error(`         PowerShell:  $env:PORT=5050; npm run server\n`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = (signal) => {
    console.log(`\n[unipay] ${signal} received — shutting down.`);
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck socket.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[unipay] failed to start:', err);
  process.exit(1);
});
