/**
 * normalize-raquel-ids.mjs
 *
 * One-time migration for the Raquel id divergence:
 *  - PlantaoAPI returns 'OV8BOzQo_JD-' (slug) in /auth/login for her.
 *  - PlantaoAPI returns '70917' (numeric) when she appears as a coworker.
 *  - Existing swap docs from Caco target '70917' but her app reads with id 'OV8BOzQo_JD-'.
 *
 * This script:
 *  1. Sets webClientUserId='70917' on users/OV8BOzQo_JD- so UserSourceResolver
 *     can map numeric → canonical going forward.
 *  2. Rewrites the 3 valid shiftSwaps with targetUserId=70917 → OV8BOzQo_JD-,
 *     keeping targetWebClientUserId=70917 for trace.
 *  3. Deletes the 4 corrupted shiftSwaps with undefined fields (already cancelled).
 *
 * Idempotent: rerunning is safe.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, deleteDoc } from 'firebase/firestore';
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
}, 'norm-raquel-' + Date.now());
const db = getFirestore(app);

const RAQUEL_CANONICAL = 'OV8BOzQo_JD-';
const RAQUEL_NUMERIC   = '70917';

// 1. Stamp the mapping on Raquel's user doc.
const ref = doc(db, 'users', RAQUEL_CANONICAL);
const snap = await getDoc(ref);
if (!snap.exists()) {
  console.error(`❌ users/${RAQUEL_CANONICAL} does not exist — aborting.`);
  await deleteApp(app);
  process.exit(1);
}
const current = snap.data() || {};
if (current.webClientUserId === RAQUEL_NUMERIC) {
  console.log(`✓ users/${RAQUEL_CANONICAL} already has webClientUserId=${RAQUEL_NUMERIC}`);
} else {
  await setDoc(ref, { webClientUserId: RAQUEL_NUMERIC, _updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`✓ users/${RAQUEL_CANONICAL} ← webClientUserId=${RAQUEL_NUMERIC}`);
}

// 2 + 3. Rewrite valid swaps, delete corrupted ones.
const swaps = await getDocs(collection(db, 'shiftSwaps'));
let rewritten = 0;
let deleted = 0;
let skipped = 0;

for (const d of swaps.docs) {
  const data = d.data() || {};
  const isCorrupted = data.targetUserId == null && data.initiatorUserId == null && data.kind == null;

  if (isCorrupted) {
    await deleteDoc(d.ref);
    console.log(`× deleted corrupted shiftSwaps/${d.id} (all key fields undefined)`);
    deleted++;
    continue;
  }

  if (String(data.targetUserId) === RAQUEL_NUMERIC) {
    await setDoc(d.ref, {
      targetUserId: RAQUEL_CANONICAL,
      targetWebClientUserId: RAQUEL_NUMERIC,
      _migratedAt: new Date().toISOString(),
    }, { merge: true });
    console.log(`→ shiftSwaps/${d.id} targetUserId ${RAQUEL_NUMERIC} → ${RAQUEL_CANONICAL}`);
    rewritten++;
  } else {
    skipped++;
  }
}

console.log(`\nDone. rewritten=${rewritten} deleted=${deleted} skipped=${skipped} total=${swaps.size}`);
await deleteApp(app);
process.exit(0);
