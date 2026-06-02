/**
 * seed-caco-memberships.mjs
 *
 * Makes raquel + caco mutual members of every group caco shares with raquel.
 * Writes per-user views (Firestore stores group membership from each user's
 * perspective: users/{uid}/groupMembers/{groupId} = { memberIds, members }).
 * Also seeds person docs so the cede flow has names/photos to display.
 *
 * Aurora users hydrate this on login (GroupsContext + FirebaseAdapter.fetchAuroraGroupMembers).
 * WebClient users (raquel) don't read it — they get members from PlantaoAPI.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, getDocs, getDoc, doc, collection, writeBatch } from 'firebase/firestore';
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
}, 'mbr-' + Date.now());
const db = getFirestore(app);

const CACO   = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';
// Raquel é webClient. Canonical id no Firestore = slug 'OV8BOzQo_JD-' (apiData.id
// em /auth/login). O numérico '70917' usado em coworker listings resolve para
// esse doc via users/OV8BOzQo_JD-.webClientUserId.
const RAQUEL = 'OV8BOzQo_JD-';

// Pull raquel's profile so we can mint a Person doc for her under caco's view.
const raqUserDoc = await getDoc(doc(db, 'users', RAQUEL));
const raq = raqUserDoc.exists() ? raqUserDoc.data() : {};
const cacUserDoc = await getDoc(doc(db, 'users', CACO));
const cac = cacUserDoc.exists() ? cacUserDoc.data() : {};

const raquelPerson = {
  id: RAQUEL,
  userId: RAQUEL,
  name: raq.name || raq.profile?.name || 'Raquel Moreira de Almeida',
  photo: raq.photo || raq.profile?.photo || null,
  role: 'Médica',
  council: raq.council || raq.profile?.council || '',
  institution: '',
};
const cacoPerson = {
  id: CACO,
  userId: CACO,
  name: cac.name || cac.profile?.name || 'caco',
  photo: cac.photo || cac.profile?.photo || null,
  role: 'Médico',
  council: cac.council || cac.profile?.council || '',
  institution: '',
};

// Caco's group docs are what we use as the shared group list.
const groupSnap = await getDocs(collection(db, 'users', CACO, 'groups'));
console.log(`Caco has ${groupSnap.size} groups → adding raquel + caco as members of each.`);

const batch = writeBatch(db);

groupSnap.forEach(g => {
  const groupId = g.id;
  // Caco's view: he sees raquel as a colleague in this group.
  batch.set(doc(db, 'users', CACO, 'groupMembers', groupId), {
    groupId,
    memberIds: [RAQUEL, CACO],
    members: [raquelPerson, cacoPerson],
    syncedAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Raquel's view: she sees caco as a colleague. (Read-back gated by source —
  // currently only aurora users hydrate this. Webclient raquel won't load it.
  // Still useful: future web-app + cross-source flows will read it.)
  batch.set(doc(db, 'users', RAQUEL, 'groupMembers', groupId), {
    groupId,
    memberIds: [CACO, RAQUEL],
    members: [cacoPerson, raquelPerson],
    syncedAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  }, { merge: true });
});

// Person docs (flat under each user)
batch.set(doc(db, 'users', CACO,   'persons', RAQUEL), { ...raquelPerson, _updatedAt: new Date().toISOString() }, { merge: true });
batch.set(doc(db, 'users', RAQUEL, 'persons', CACO),   { ...cacoPerson,   _updatedAt: new Date().toISOString() }, { merge: true });

await batch.commit();
console.log(`✅ Wrote groupMembers for ${groupSnap.size} groups on both sides + 2 person docs.`);

await deleteApp(app);
process.exit(0);
