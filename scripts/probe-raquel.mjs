import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';
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
}, 'probe-' + Date.now());
const db = getFirestore(app);

const RAQUEL = process.argv[2] || 'OV8BOzQo_JD';
console.log(`\nProbing raquel candidate "${RAQUEL}"\n`);

// 1. user doc
const u = await getDoc(doc(db, 'users', RAQUEL));
console.log('users/' + RAQUEL + ' exists:', u.exists(), u.exists() ? Object.keys(u.data() || {}) : '');

// 2. subcollections under users/{RAQUEL}
for (const c of ['groups', 'persons', 'months', 'financialConfig', 'settings']) {
  const snap = await getDocs(collection(db, 'users', RAQUEL, c));
  console.log(`users/${RAQUEL}/${c}: ${snap.size} docs`);
}

// 3. flat legacy paths
for (const c of ['aurora_groups', 'aurora_users', 'aurora_persons', 'aurora_shifts']) {
  const d = await getDoc(doc(db, c, RAQUEL));
  console.log(`${c}/${RAQUEL} exists:`, d.exists());
}

// 4. list all top-level user docs (scan to find the real raquel id)
console.log('\n— top-level users/ collection —');
const allU = await getDocs(collection(db, 'users'));
console.log(`total users: ${allU.size}`);
for (const d of allU.docs) {
  const data = d.data() || {};
  const profile = data.profile || {};
  console.log(`  ${d.id}  email=${profile.email || data.email || '(?)'} name=${profile.name || '(?)'}`);
}

await deleteApp(app);
process.exit(0);
