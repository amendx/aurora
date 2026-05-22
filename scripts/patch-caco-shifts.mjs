/**
 * patch-caco-shifts.mjs
 *
 * Backfills caco's seeded shifts so they qualify as aurora-owned in
 * ShiftBottomSheet (which gates the Ceder/Trocar buttons on
 * `isManual || source ∈ {aurora, aurora_opening, received}` AND
 * `startTs > Date.now()` via shift.startISO).
 *
 * Adds: source='received', startISO, endISO, originUserId (the raquel uid we
 * pretended ceded them). Keeps everything else intact.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, getDocs, collection, writeBatch, doc } from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dir = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: resolve(__dir, '../.env.local') }); } catch {}

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'patch-' + Date.now());
const db = getFirestore(app);

const CACO   = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';
const RAQUEL = 'OV8BOzQo_JD-';
const MONTH  = '2026-05';

const toISO = (date, hhmm) => {
  // Local Brazil time naive ISO: YYYY-MM-DDTHH:MM:00 (no TZ suffix matches existing seed style)
  return `${date}T${hhmm}:00`;
};

const snap = await getDocs(collection(db, 'users', CACO, 'months', MONTH, 'shifts'));
console.log(`Found ${snap.size} shifts to patch.`);

const batch = writeBatch(db);
let n = 0;
snap.forEach(d => {
  const s = d.data();
  if (!s?.date || !s?.startTime || !s?.endTime) return;
  const startISO = toISO(s.date, s.startTime);
  // Naive next-day handling for night shifts that cross midnight
  let endISO;
  if (s.crossesMidnight) {
    const nextDate = new Date(s.date + 'T00:00:00');
    nextDate.setDate(nextDate.getDate() + 1);
    const nd = nextDate.toISOString().slice(0, 10);
    endISO = toISO(nd, s.endTime);
  } else {
    endISO = toISO(s.date, s.endTime);
  }
  batch.set(doc(db, 'users', CACO, 'months', MONTH, 'shifts', d.id), {
    ...s,
    source:        'received',
    isManual:      false,
    startISO,
    endISO,
    originUserId:  RAQUEL,
    transferredAt: new Date().toISOString(),
    _updatedAt:    new Date().toISOString(),
  }, { merge: true });
  n++;
});

await batch.commit();
console.log(`✅ Patched ${n} shifts with source='received', startISO, endISO, originUserId.`);

await deleteApp(app);
process.exit(0);
