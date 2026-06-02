/**
 * set-caco-shifts.mjs
 *
 * Setup de teste end-to-end para o fluxo Ceder/Trocar entre caco (Aurora) e
 * raquel (webClient). Ambos no MESMO grupo "LÍDER 1 HLF".
 *
 *   caco   → 28/05, 29/05, 01/06, 02/06  (escala fixa dele)
 *   raquel → 30/05, 31/05, 03/06         (pra caco ter o que trocar)
 *
 * Todos os plantões em LÍDER 1 HLF, com source:'aurora' + isFixedSchedule:true,
 * startISO/endISO preenchidos (desbloqueia botões Ceder/Trocar no app).
 *
 * Idempotente: limpa os meses 2026-05 e 2026-06 dos dois usuários e reescreve.
 *
 * Run: node scripts/set-caco-shifts.mjs
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: resolve(__dir, '../.env.local') }); } catch {}

const app = initializeApp({
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'set-caco-' + Date.now());
const db = getFirestore(app);

// ── Targets ───────────────────────────────────────────────────────────────────
const CACO   = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';
// Raquel é webClient. O PlantaoAPI retorna o slug 'OV8BOzQo_JD-' em /auth/login
// (apiData.id) e o numérico '70917' quando ela aparece como coworker de outros.
// O canonical no Firestore é o slug — UserSourceResolver mapeia o numérico via
// users/OV8BOzQo_JD-.webClientUserId='70917'.
const RAQUEL = 'OV8BOzQo_JD-';
const MONTHS = ['2026-05', '2026-06']; // limpa ambos pra não sobrar lixo de seeds antigos
const NOW    = new Date().toISOString();

const _norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().trim();

// ── Achar o grupo LÍDER 1 HLF entre os grupos do caco ─────────────────────────
const groupsSnap = await getDocs(collection(db, 'users', CACO, 'groups'));
if (groupsSnap.empty) {
  console.error('❌ caco não tem grupos. Rode scripts/clone-raquel-to-caco.mjs primeiro.');
  await deleteApp(app);
  process.exit(1);
}
const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const lider = groups.find(g => _norm(g.name).includes('LIDER 1 HLF'))
  || groups.find(g => _norm(g.name).includes('LIDER 1'));

if (!lider) {
  console.error('❌ grupo "LÍDER 1 HLF" não encontrado. Grupos disponíveis:');
  groups.forEach(g => console.error(`   • ${g.name} (${g.id})`));
  await deleteApp(app);
  process.exit(1);
}
console.log(`✓ grupo alvo: ${lider.name} (${lider.id})`);

const GROUP = {
  id:              String(lider.id),
  name:            lider.name || 'LÍDER 1 HLF',
  color:           lider.color || null,
  institutionId:   lider.institutionId ?? null,
  institutionName: lider.institutionName ?? null,
};

const toISO = (date, hhmm) => `${date}T${hhmm}:00`;
const nextDayISO = (date, hhmm) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return toISO(d.toISOString().slice(0, 10), hhmm);
};

const TEMPLATES = {
  M: { rawLabel: 'Diurno',  startTime: '07:00', endTime: '13:00', durationMinutes: 360, crossesMidnight: false },
  T: { rawLabel: 'Vespertino', startTime: '13:00', endTime: '19:00', durationMinutes: 360, crossesMidnight: false },
  N: { rawLabel: 'Noturno', startTime: '19:00', endTime: '07:00', durationMinutes: 720, crossesMidnight: true  },
};

const buildShift = (uid, date, label, idSuffix) => {
  const tpl = TEMPLATES[label];
  const id = `shift_${date.replace(/-/g, '')}_${label}_${idSuffix}`;
  const startISO = toISO(date, tpl.startTime);
  const endISO = tpl.crossesMidnight ? nextDayISO(date, tpl.endTime) : toISO(date, tpl.endTime);
  return {
    id,
    data: {
      id,
      userId: uid,
      date,
      monthKey: date.slice(0, 7),
      label,
      rawLabel: tpl.rawLabel,
      startTime: tpl.startTime,
      endTime: tpl.endTime,
      durationMinutes: tpl.durationMinutes,
      crossesMidnight: tpl.crossesMidnight,
      carryover: false,
      splitHours: null,
      group: GROUP,
      coworkerIds: [],
      source: 'aurora',
      isManual: false,
      isFixedSchedule: true,
      startISO,
      endISO,
      syncedAt: NOW,
      _updatedAt: NOW,
    },
  };
};

// caco — todos futuros, com folga pra não expirar durante testes
const CACO_SHIFTS = [
  buildShift(CACO, '2026-06-02', 'M', 'caco'),
  buildShift(CACO, '2026-06-03', 'T', 'caco'),
  buildShift(CACO, '2026-06-05', 'N', 'caco'),
  buildShift(CACO, '2026-06-06', 'M', 'caco'),
];

// raquel — datas diferentes pra caco ter o que receber numa troca
const RAQUEL_SHIFTS = [
  buildShift(RAQUEL, '2026-06-04', 'M', 'raquel'),
  buildShift(RAQUEL, '2026-06-07', 'T', 'raquel'),
  buildShift(RAQUEL, '2026-06-08', 'N', 'raquel'),
];

// ── Wipe meses dos dois usuários ──────────────────────────────────────────────
const wipeUserMonths = async (uid, label) => {
  for (const mk of MONTHS) {
    const snap = await getDocs(collection(db, 'users', uid, 'months', mk, 'shifts'));
    if (snap.empty) continue;
    const b = writeBatch(db);
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
    console.log(`🗑️  ${label}: limpou ${snap.size} plantões de ${mk}`);
  }
};
await wipeUserMonths(CACO, 'caco');
await wipeUserMonths(RAQUEL, 'raquel');

// ── Escrever ──────────────────────────────────────────────────────────────────
const writeShifts = async (uid, shifts, label) => {
  const b = writeBatch(db);
  for (const sh of shifts) {
    b.set(doc(db, 'users', uid, 'months', sh.data.monthKey, 'shifts', sh.id), sh.data);
  }
  // refresh month meta para os dois meses tocados
  for (const mk of MONTHS) {
    b.set(doc(db, 'users', uid, 'months', mk), { userId: uid, monthKey: mk, syncedAt: NOW, _updatedAt: NOW }, { merge: true });
  }
  await b.commit();
  console.log(`✅ ${label}: ${shifts.length} plantões`);
  shifts.forEach(s => console.log(`   • ${s.data.date} ${s.data.label} — ${GROUP.name}`));
};

await writeShifts(CACO, CACO_SHIFTS, 'caco');
await writeShifts(RAQUEL, RAQUEL_SHIFTS, 'raquel');

console.log('\n✅ Pronto. caco e raquel no grupo LÍDER 1 HLF, em datas que não colidem.');
await deleteApp(app);
process.exit(0);
