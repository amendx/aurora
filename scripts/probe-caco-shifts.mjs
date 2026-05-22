import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, getDocs, collection } from 'firebase/firestore';
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
}, 'probe-caco-' + Date.now());
const db = getFirestore(app);

const CACO = 'ozQ81bIxlFfjqx8zCjEtJB9v3Dt1';

const groups = await getDocs(collection(db, 'users', CACO, 'groups'));
console.log(`users/${CACO}/groups: ${groups.size} docs`);

const shifts = await getDocs(collection(db, 'users', CACO, 'months', '2026-05', 'shifts'));
console.log(`users/${CACO}/months/2026-05/shifts: ${shifts.size} docs`);
shifts.forEach(d => {
  const s = d.data();
  console.log(`  ${d.id}  date=${s.date} ${s.label} ${s.startTime}-${s.endTime} group=${s.group?.name}`);
});

const manual = await getDocs(collection(db, 'users', CACO, 'manualShifts'));
console.log(`users/${CACO}/manualShifts: ${manual.size} docs`);

await deleteApp(app);
process.exit(0);
