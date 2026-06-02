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
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}, 'probe-swaps-' + Date.now());
const db = getFirestore(app);
const snap = await getDocs(collection(db, 'shiftSwaps'));
console.log(`shiftSwaps: ${snap.size} docs`);
snap.forEach(d => {
  const x = d.data();
  console.log(`\n${d.id}`);
  console.log(`  status=${x.status} kind=${x.kind}`);
  console.log(`  initiator=${x.initiatorUserId} (${x.initiatorUserName})`);
  console.log(`  target=${x.targetUserId} (${x.targetUserName})`);
  console.log(`  shiftA=${x.shiftA?.id} ${x.shiftA?.date} | shiftB=${x.shiftB?.id} ${x.shiftB?.date}`);
  console.log(`  createdAt=${x.createdAt}`);
});
await deleteApp(app); process.exit(0);
