/**
 * clone-raquel-to-caco.mjs
 *
 * Test data setup: gives caco (Aurora-native, no PlantaoAPI presence) a stack
 * of shifts in May 2026 using raquel's groups, so we can exercise the swap /
 * ceder flow between a WebClient user (raquel) and an Aurora user (caco).
 *
 * What it does:
 *   1. reads raquel's groups + persons from Firestore
 *   2. copies them under caco
 *   3. generates 14 varied shifts for caco between 2026-05-18 and 2026-05-31
 *      (M/T/N mix, varying groups, valid times)
 *   4. writes month metadata doc for caco/2026-05
 *
 * Run: node scripts/clone-raquel-to-caco.mjs
 */

import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, writeBatch,
} from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dir, '../.env.local') });
} catch {}

const required = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing env:', missing.join(', '));
  process.exit(1);
}

const app = initializeApp({
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'clone-' + Date.now());
const db = getFirestore(app);

// ── Targets ───────────────────────────────────────────────────────────────────
const RAQUEL = 'OV8BOzQo_JD-';
const CACO   = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';
const MONTH  = '2026-05';
const NOW    = new Date().toISOString();

// ── Helpers ───────────────────────────────────────────────────────────────────
const sub = (uid, ...path) => doc(db, 'users', uid, ...path);

const readSub = async (uid, name) => {
  const snap = await getDocs(collection(db, 'users', uid, name));
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
};

const batchWrite = async (writes, label) => {
  if (writes.length === 0) {
    console.log(`  (${label}: nothing to write)`);
    return;
  }
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const b = writeBatch(db);
    for (const { ref, data } of chunk) {
      b.set(ref, { ...data, _updatedAt: NOW }, { merge: true });
    }
    await b.commit();
  }
  console.log(`  ✅ ${label}: ${writes.length} docs`);
};

// ── 1. Clone groups + persons from raquel → caco ─────────────────────────────
console.log(`\nCloning raquel (${RAQUEL}) → caco (${CACO}) for ${MONTH}\n`);

const raqGroups  = await readSub(RAQUEL, 'groups');
const raqPersons = await readSub(RAQUEL, 'persons');

if (raqGroups.length === 0) {
  console.error('❌ raquel has 0 groups in users/' + RAQUEL + '/groups — aborting');
  console.error('   confirm raquel has logged into the app at least once so shadow-write populated her data');
  await deleteApp(app);
  process.exit(1);
}

await batchWrite(
  raqGroups.map(g => ({ ref: sub(CACO, 'groups', g.id), data: g.data })),
  'groups → caco'
);

await batchWrite(
  raqPersons.map(p => ({ ref: sub(CACO, 'persons', p.id), data: p.data })),
  'persons → caco'
);

// ── 2. Generate shifts for caco, 2026-05-18 → 2026-05-31 ─────────────────────
// Day-of-week reference (May 2026): 18=Mon, 22=Fri, 23=Sat, 24=Sun, 29=Fri, 30=Sat, 31=Sun.
//
// Shape per src/models/index.js + _stripShift contract: id, userId, date,
// monthKey, label, rawLabel, startTime, endTime, durationMinutes,
// crossesMidnight, carryover, splitHours, group, coworkerIds, syncedAt.

const SHIFT_TEMPLATES = [
  { label: 'M', rawLabel: 'Diurno',  startTime: '07:00', endTime: '13:00', durationMinutes: 360, crossesMidnight: false },
  { label: 'M', rawLabel: 'Diurno',  startTime: '07:00', endTime: '19:00', durationMinutes: 720, crossesMidnight: false },
  { label: 'T', rawLabel: 'Vespertino', startTime: '13:00', endTime: '19:00', durationMinutes: 360, crossesMidnight: false },
  { label: 'N', rawLabel: 'Noturno', startTime: '19:00', endTime: '07:00', durationMinutes: 720, crossesMidnight: true  },
];

const SCHEDULE = [
  // [day, templateIndex]
  [18, 0],
  [19, 3],
  [20, 2],
  [21, 1],
  [22, 3],
  [23, 0],
  [24, 2],
  [25, 0],
  [26, 3],
  [27, 2],
  [28, 1],
  [29, 3],
  [30, 0],
  [31, 2],
];

const stripGroup = (g) => ({
  id:              g.id,
  name:            g.name,
  color:           g.color || null,
  institutionId:   g.institutionId ?? null,
  institutionName: g.institutionName ?? null,
});

const groupForIndex = (i) => stripGroup(raqGroups[i % raqGroups.length].data);

const shiftWrites = [];
for (let i = 0; i < SCHEDULE.length; i++) {
  const [day, tplIdx] = SCHEDULE[i];
  const tpl  = SHIFT_TEMPLATES[tplIdx];
  const date = `${MONTH}-${String(day).padStart(2, '0')}`;
  const id   = `shift_${date.replace(/-/g, '')}_${tpl.label}_caco`;
  const grp  = groupForIndex(i);

  shiftWrites.push({
    ref: sub(CACO, 'months', MONTH, 'shifts', id),
    data: {
      id,
      userId:          CACO,
      date,
      monthKey:        MONTH,
      label:           tpl.label,
      rawLabel:        tpl.rawLabel,
      startTime:       tpl.startTime,
      endTime:         tpl.endTime,
      durationMinutes: tpl.durationMinutes,
      crossesMidnight: tpl.crossesMidnight,
      carryover:       false,
      splitHours:      null,
      group:           grp,
      coworkerIds:     [],
      syncedAt:        NOW,
    },
  });
}

// Month metadata doc
await setDoc(
  sub(CACO, 'months', MONTH),
  { userId: CACO, monthKey: MONTH, syncedAt: NOW, _updatedAt: NOW },
  { merge: true }
);
console.log(`  ✅ month meta: users/${CACO}/months/${MONTH}`);

await batchWrite(shiftWrites, `shifts → caco/${MONTH}`);

console.log('\n✅ Done.\n');
console.log(`  caco now has ${shiftWrites.length} shifts in ${MONTH}, sharing ${raqGroups.length} groups with raquel.`);
console.log('  Test the swap/ceder flow: log in as raquel, look at caco\'s available shifts.\n');

await deleteApp(app);
process.exit(0);
