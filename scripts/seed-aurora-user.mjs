/**
 * seed-aurora-user.mjs
 *
 * Cria um usuário Aurora completo para testar trocas com o caco (Aurora) —
 * conta Firebase Auth + doc users/{uid} + defaults + membership recíproca no
 * grupo LÍDER 1 HLF + 4 plantões em datas que não colidem com caco/raquel.
 *
 * Idempotente: se o email já existir, faz signIn pra recuperar o uid e
 * reescreve a árvore de dados.
 *
 * Usage:
 *   node scripts/seed-aurora-user.mjs                  # usa defaults abaixo
 *   node scripts/seed-aurora-user.mjs <email> <pwd> <name> <username>
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
try { const { config } = await import('dotenv'); config({ path: resolve(__dir, '../.env.local') }); } catch {}

// ── Defaults (sobrescreva via argv) ───────────────────────────────────────────
const EMAIL    = process.argv[2] || 'marcelo-aurora@aurora.test';
const PASSWORD = process.argv[3] || 'aurora1234';
const NAME     = process.argv[4] || 'Marcelo Aurora';
const USERNAME = process.argv[5] || 'marcelo.aurora';

const CACO     = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';
const MONTH    = '2026-06';
const NOW_ISO  = new Date().toISOString();

const app = initializeApp({
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'seed-aurora-' + Date.now());
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Firebase Auth: cria ou recupera ───────────────────────────────────────────
let uid;
try {
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  uid = cred.user.uid;
  console.log(`✓ conta Auth criada — uid=${uid} email=${EMAIL}`);
} catch (err) {
  if (err.code === 'auth/email-already-in-use') {
    const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    uid = cred.user.uid;
    console.log(`✓ conta Auth já existia — uid=${uid} email=${EMAIL}`);
  } else {
    console.error(`❌ falha no Auth (${err.code}): ${err.message}`);
    await deleteApp(app);
    process.exit(1);
  }
}

// Sign out: as escritas seguintes precisam usar o fallback webClient (auth==null)
// porque a regra `canAccess` só libera o próprio uid quando autenticado, e a
// gente precisa escrever também na árvore do caco (membership recíproca).
await signOut(auth);

// ── Achar o grupo LÍDER 1 HLF entre os do caco ────────────────────────────────
const _norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const groupsSnap = await getDocs(collection(db, 'users', CACO, 'groups'));
const cacoGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
const lider = cacoGroups.find(g => _norm(g.name).includes('LIDER 1 HLF'))
           || cacoGroups.find(g => _norm(g.name).includes('LIDER 1'));
if (!lider) {
  console.error('❌ grupo "LÍDER 1 HLF" não encontrado no caco.');
  await deleteApp(app); process.exit(1);
}
console.log(`✓ grupo alvo: ${lider.name} (${lider.id})`);

const GROUP = {
  id:              String(lider.id),
  name:            lider.name,
  color:           lider.color || null,
  institutionId:   lider.institutionId ?? null,
  institutionName: lider.institutionName ?? null,
};

// ── User profile doc (mesma shape de SignupService.createAccount) ─────────────
await setDoc(doc(db, 'users', uid), {
  id: uid,
  name: NAME,
  email: EMAIL,
  username: USERNAME,
  photo: null,
  council: { id: '', state: '' },
  role: 'Médico',
  phone: '',
  hospitals: [],
  is_premium: false,
  source: 'aurora',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  lastLoginAt: serverTimestamp(),
}, { merge: true });
console.log(`✓ users/${uid} (source=aurora)`);

// ── Defaults: financialConfig, settings, meses vazios ─────────────────────────
await Promise.all([
  setDoc(doc(db, 'users', uid, 'financialConfig', 'current'), {
    userId: uid, version: 1, effectiveFrom: MONTH,
    hourValues: { weekdayDay: 0, weekdayNight: 0, weekendDay: 0, weekendNight: 0 },
    loyaltyEnabled: false, loyaltyOptions: [],
    bonusEnabled: false, bonus: null,
    fridayNightAsWeekend: false,
    updatedAt: serverTimestamp(),
  }),
  setDoc(doc(db, 'users', uid, 'financialConfigHistory', '1'), {
    userId: uid, version: 1, effectiveFrom: MONTH,
    hourValues: { weekdayDay: 0, weekdayNight: 0, weekendDay: 0, weekendNight: 0 },
    loyaltyEnabled: false, loyaltyOptions: [],
    bonusEnabled: false, bonus: null,
    fridayNightAsWeekend: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }),
  setDoc(doc(db, 'users', uid, 'settings', 'groupVisibility'), { hiddenGroups: [], updatedAt: serverTimestamp() }),
  setDoc(doc(db, 'users', uid, 'settings', 'groupColors'),     { colors: {},       updatedAt: serverTimestamp() }),
]);
console.log('✓ defaults (financialConfig + settings)');

// ── O grupo na visão do novo usuário ──────────────────────────────────────────
await setDoc(doc(db, 'users', uid, 'groups', GROUP.id), {
  ...GROUP,
  ...(lider.institution ? { institution: lider.institution } : {}),
  _updatedAt: NOW_ISO,
}, { merge: true });
console.log(`✓ users/${uid}/groups/${GROUP.id}`);

// ── Membership recíproca: caco vê o novo user, e vice-versa ───────────────────
const cacoDoc  = (await getDoc(doc(db, 'users', CACO))).data() || {};
const newUserPerson = {
  id: uid, userId: uid, name: NAME,
  photo: null, role: 'Médico', council: '', institution: '',
};
const cacoPerson = {
  id: CACO, userId: CACO,
  name: cacoDoc.name || cacoDoc.profile?.name || 'caco',
  photo: cacoDoc.photo || cacoDoc.profile?.photo || null,
  role: 'Médico', council: '', institution: '',
};

// caco's view: read current members, add the new user (avoid duplicates).
const cacoMembersRef  = doc(db, 'users', CACO, 'groupMembers', GROUP.id);
const cacoMembersSnap = await getDoc(cacoMembersRef);
const cacoCurrent     = cacoMembersSnap.exists() ? cacoMembersSnap.data() : { memberIds: [], members: [] };
const cacoMemberIds   = Array.from(new Set([...(cacoCurrent.memberIds || []), uid]));
const cacoMembers     = [
  ...(cacoCurrent.members || []).filter(m => String(m.id) !== uid),
  newUserPerson,
];
await setDoc(cacoMembersRef, {
  userId: CACO, groupId: GROUP.id,
  memberIds: cacoMemberIds, members: cacoMembers,
  syncedAt: NOW_ISO, _updatedAt: NOW_ISO,
}, { merge: true });

// new user's view: only caco for now (a fresh Aurora user wouldn't see raquel
// from Firestore — raquel is webClient and her membership lives in PlantaoAPI).
await setDoc(doc(db, 'users', uid, 'groupMembers', GROUP.id), {
  userId: uid, groupId: GROUP.id,
  memberIds: [CACO],
  members: [cacoPerson],
  syncedAt: NOW_ISO, _updatedAt: NOW_ISO,
}, { merge: true });

// Person docs (each user keeps a /persons/{otherId} for name/photo cache).
await setDoc(doc(db, 'users', CACO, 'persons', uid),  { ...newUserPerson, _updatedAt: NOW_ISO }, { merge: true });
await setDoc(doc(db, 'users', uid,  'persons', CACO), { ...cacoPerson,    _updatedAt: NOW_ISO }, { merge: true });
console.log('✓ membership recíproca + person docs');

// ── Shifts ────────────────────────────────────────────────────────────────────
const TEMPLATES = {
  M: { rawLabel: 'Diurno',     startTime: '07:00', endTime: '13:00', durationMinutes: 360, crossesMidnight: false },
  T: { rawLabel: 'Vespertino', startTime: '13:00', endTime: '19:00', durationMinutes: 360, crossesMidnight: false },
  N: { rawLabel: 'Noturno',    startTime: '19:00', endTime: '07:00', durationMinutes: 720, crossesMidnight: true  },
};
const toISO = (date, hhmm) => `${date}T${hhmm}:00`;
const nextDayISO = (date, hhmm) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return toISO(d.toISOString().slice(0, 10), hhmm);
};
const idSuffix = USERNAME.split('.')[0] || 'aurora';
const buildShift = (date, label) => {
  const tpl = TEMPLATES[label];
  const id  = `shift_${date.replace(/-/g, '')}_${label}_${idSuffix}`;
  const startISO = toISO(date, tpl.startTime);
  const endISO   = tpl.crossesMidnight ? nextDayISO(date, tpl.endTime) : toISO(date, tpl.endTime);
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
      startISO, endISO,
      syncedAt: NOW_ISO,
      _updatedAt: NOW_ISO,
    },
  };
};

// Datas escolhidas pra não colidir com caco (02,03,05,06) nem raquel (04,07,08).
const SHIFTS = [
  buildShift('2026-06-10', 'M'),
  buildShift('2026-06-12', 'T'),
  buildShift('2026-06-15', 'N'),
  buildShift('2026-06-17', 'M'),
];

// Limpa shifts antigos do mês pra script ser idempotente.
const existingSnap = await getDocs(collection(db, 'users', uid, 'months', MONTH, 'shifts'));
if (!existingSnap.empty) {
  const wipe = writeBatch(db);
  existingSnap.forEach(d => wipe.delete(d.ref));
  await wipe.commit();
  console.log(`🗑️  limpou ${existingSnap.size} plantões antigos de ${MONTH}`);
}

const b = writeBatch(db);
for (const sh of SHIFTS) {
  b.set(doc(db, 'users', uid, 'months', MONTH, 'shifts', sh.id), sh.data);
}
b.set(doc(db, 'users', uid, 'months', MONTH), {
  userId: uid, monthKey: MONTH, syncedAt: NOW_ISO, _updatedAt: NOW_ISO,
}, { merge: true });
await b.commit();

console.log(`✅ ${SHIFTS.length} plantões em ${MONTH}:`);
SHIFTS.forEach(s => console.log(`   • ${s.data.date} ${s.data.label} — ${GROUP.name}`));

console.log('\n🎉 Pronto. Para logar no app:');
console.log(`   email: ${EMAIL}`);
console.log(`   senha: ${PASSWORD}`);
console.log(`   uid:   ${uid}`);

await deleteApp(app);
process.exit(0);
