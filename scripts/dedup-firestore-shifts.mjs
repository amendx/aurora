/**
 * dedup-firestore-shifts.mjs
 *
 * Remove duplicatas em users/{uid}/months/{mk}/shifts agrupando por (date+label+group.id).
 * Mantém o doc mais recente (_updatedAt maior) — apaga os outros.
 *
 * Útil quando coexistem seeds antigos + snapshot do aurora-only mode (ids diferentes,
 * mesmo logical shift).
 *
 * Run: node scripts/dedup-firestore-shifts.mjs <uid> [monthKey ...]
 *   node scripts/dedup-firestore-shifts.mjs OV8BOzQo_JD- 2026-05 2026-06
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, getDocs, collection, writeBatch } from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: resolve(__dir, '../.env.local') }); } catch {}

const [, , uid, ...months] = process.argv;
if (!uid || months.length === 0) {
  console.error('uso: node scripts/dedup-firestore-shifts.mjs <uid> <monthKey> [<monthKey>...]');
  process.exit(1);
}

const app = initializeApp({
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'dedup-' + Date.now());
const db = getFirestore(app);

let totalKept = 0;
let totalDeleted = 0;

for (const mk of months) {
  const snap = await getDocs(collection(db, 'users', uid, 'months', mk, 'shifts'));
  if (snap.empty) { console.log(`(vazio) ${mk}`); continue; }
  const byKey = new Map();
  snap.forEach(d => {
    const data = d.data() || {};
    const date = data.date || (data.startISO || '').slice(0, 10);
    const key = `${date}_${data.label || ''}_${data.group?.id || ''}`;
    const arr = byKey.get(key) || [];
    arr.push({ id: d.id, ref: d.ref, ts: data._updatedAt ? Date.parse(data._updatedAt) : 0, data });
    byKey.set(key, arr);
  });

  const toDelete = [];
  for (const [key, arr] of byKey.entries()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => b.ts - a.ts); // mais novo primeiro
    const keeper = arr[0];
    console.log(`[${mk}] ${key}: mantém ${keeper.id} (ts=${keeper.ts}), apaga ${arr.length - 1}`);
    for (let i = 1; i < arr.length; i++) toDelete.push(arr[i]);
  }

  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + 400).forEach(x => batch.delete(x.ref));
    await batch.commit();
  }
  totalDeleted += toDelete.length;
  totalKept += snap.size - toDelete.length;
}

console.log(`\n✅ feito. mantidos=${totalKept} apagados=${totalDeleted}`);
await deleteApp(app);
process.exit(0);
