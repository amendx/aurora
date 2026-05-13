/**
 * seed-firestore.mjs
 *
 * Seeds Firestore with realistic Aurora data matching the exact model shapes
 * defined in src/models/index.js.
 *
 * Run: node scripts/seed-firestore.mjs
 *
 * This simulates what LocalCache + FirebaseAdapter write during normal app use.
 * All collections and document structures are production-identical.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local from repo root (if present) so this script works without
// a full Expo build pipeline. dotenv is a dev-only dependency.
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dir, '../.env.local') });
} catch {
  // dotenv not installed — rely on shell environment variables
}

const required = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n❌ Missing required env vars:', missing.join(', '));
  console.error('   Copy .env.example → .env.local and fill in your Firebase values.\n');
  process.exit(1);
}

const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(FIREBASE_CONFIG, 'seed-' + Date.now());
const db  = getFirestore(app);

// ── Seed constants ────────────────────────────────────────────────────────────
const USER_ID  = 1001;
const MONTH_KEY = '2026-04';
const DOC_ID   = `${USER_ID}_${MONTH_KEY}`;
const NOW      = new Date().toISOString();

// ── Helpers ───────────────────────────────────────────────────────────────────
const write = async (collectionName, docId, data) => {
  await setDoc(
    doc(db, collectionName, String(docId)),
    { ...data, _updatedAt: NOW },
    { merge: true }
  );
  console.log(`  ✅ ${collectionName}/${docId}`);
};

// ── 1. aurora_shifts ──────────────────────────────────────────────────────────
// { daysWithShifts: Day[], syncedAt }
// Day = { date, shifts: Shift[] }

const SHIFTS_DATA = {
  userId: USER_ID,
  monthKey: MONTH_KEY,
  syncedAt: NOW,
  daysWithShifts: [
    {
      date: '2026-04-01',
      shifts: [
        {
          id: 'shift_20260401_N',
          userId: USER_ID,
          date: '2026-04-01',
          monthKey: MONTH_KEY,
          label: 'N',
          rawLabel: 'Noturno',
          startTime: '19:00',
          endTime: '07:00',
          durationMinutes: 720,
          crossesMidnight: true,
          carryover: false,
          splitHours: null,
          group: {
            id: 42,
            name: 'Plantão UPA Central',
            color: '#4A90D9',
            institutionId: 7,
            institutionName: 'UPA Central',
          },
          coworkerIds: [201, 202],
          syncedAt: NOW,
        },
      ],
    },
    {
      date: '2026-04-05',
      shifts: [
        {
          id: 'shift_20260405_M',
          userId: USER_ID,
          date: '2026-04-05',
          monthKey: MONTH_KEY,
          label: 'M',
          rawLabel: 'Diurno',
          startTime: '07:00',
          endTime: '13:00',
          durationMinutes: 360,
          crossesMidnight: false,
          carryover: false,
          splitHours: null,
          group: {
            id: 43,
            name: 'Ambulatório Pediatria',
            color: '#E8A838',
            institutionId: 8,
            institutionName: 'Hospital Municipal',
          },
          coworkerIds: [203],
          syncedAt: NOW,
        },
      ],
    },
    {
      date: '2026-04-12',
      shifts: [
        {
          id: 'shift_20260412_N',
          userId: USER_ID,
          date: '2026-04-12',
          monthKey: MONTH_KEY,
          label: 'N',
          rawLabel: 'Noturno',
          startTime: '19:00',
          endTime: '07:00',
          durationMinutes: 720,
          crossesMidnight: true,
          carryover: false,
          splitHours: null,
          group: {
            id: 42,
            name: 'Plantão UPA Central',
            color: '#4A90D9',
            institutionId: 7,
            institutionName: 'UPA Central',
          },
          coworkerIds: [201],
          syncedAt: NOW,
        },
      ],
    },
    {
      date: '2026-04-30',
      shifts: [
        {
          // Night shift on last day — has splitHours
          id: 'shift_20260430_N',
          userId: USER_ID,
          date: '2026-04-30',
          monthKey: MONTH_KEY,
          label: 'N',
          rawLabel: 'Noturno',
          startTime: '19:00',
          endTime: '07:00',
          durationMinutes: 720,
          crossesMidnight: true,
          carryover: false,
          splitHours: {
            minutesThisMonth: 300,  // 19:00 → 00:00 = 5h
            minutesNextMonth: 420,  // 00:00 → 07:00 = 7h
          },
          group: {
            id: 42,
            name: 'Plantão UPA Central',
            color: '#4A90D9',
            institutionId: 7,
            institutionName: 'UPA Central',
          },
          coworkerIds: [201, 204],
          syncedAt: NOW,
        },
      ],
    },
  ],
};

// ── 2. aurora_te (time entries) ───────────────────────────────────────────────
// { entries: { [shiftId]: TimeEntry } }

const TIME_ENTRIES_DATA = {
  userId: USER_ID,
  monthKey: MONTH_KEY,
  entries: {
    shift_20260401_N: {
      shiftId: 'shift_20260401_N',
      userId: USER_ID,
      date: '2026-04-01',
      monthKey: MONTH_KEY,
      scheduledStart: '19:00',
      scheduledEnd: '07:00',
      actualStart: '19:15',
      actualEnd: '07:30',
      actualDurationMinutes: 735,
      editedAt: NOW,
    },
    shift_20260405_M: {
      shiftId: 'shift_20260405_M',
      userId: USER_ID,
      date: '2026-04-05',
      monthKey: MONTH_KEY,
      scheduledStart: '07:00',
      scheduledEnd: '13:00',
      actualStart: '07:00',
      actualEnd: '13:00',
      actualDurationMinutes: 360,
      editedAt: NOW,
    },
  },
};

// ── 3. aurora_summaries ───────────────────────────────────────────────────────
// MonthSummary — materialized totals

const FINANCIAL_CONFIG_SNAPSHOT = {
  userId: USER_ID,
  version: 3,
  effectiveFrom: '2026-01',
  hourValues: {
    weekday: { day: 65.00, night: 78.00 },
    weekend: { day: 85.00, night: 100.00 },
  },
  loyaltyEnabled: true,
  loyaltyOptions: [
    { minHours: 24, percentage: 5,  active: false },
    { minHours: 36, percentage: 10, active: true  },
    { minHours: 48, percentage: 15, active: false },
  ],
  bonusEnabled: true,
  bonus: {
    percentage: 8,
    startMonth: '2026-01',
    endMonth: '2026-12',
  },
  fridayNightAsWeekend: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SUMMARY_DATA = {
  userId: USER_ID,
  monthKey: MONTH_KEY,
  totalScheduledMinutes: 2100,   // 35h
  totalActualMinutes: 2135,
  totalGrossValue: 2730.00,      // base pay before bonuses
  totalBonusValue: 218.40,       // 8% general bonus
  totalLoyaltyValue: 273.00,     // 10% loyalty on 36h+
  shiftCount: 4,
  weekdayDayMinutes: 360,
  weekdayNightMinutes: 1440,
  weekendDayMinutes: 0,
  weekendNightMinutes: 0,
  fridayNightMinutes: 300,       // last-of-month split counted as friday night
  configVersion: 3,
  financialConfigSnapshot: FINANCIAL_CONFIG_SNAPSHOT,
  generatedAt: NOW,
  isDirty: false,
};

// ── 4. aurora_users (financial config) ───────────────────────────────────────

const FINANCIAL_CONFIG_DATA = {
  financialConfig: FINANCIAL_CONFIG_SNAPSHOT,
};

// ── 5. aurora_groups ──────────────────────────────────────────────────────────
// { groups: Group[], syncedAt }

const GROUPS_DATA = {
  userId: USER_ID,
  syncedAt: NOW,
  groups: [
    {
      id: 42,
      name: 'Plantão UPA Central',
      color: '#4A90D9',
      institutionId: 7,
      institutionName: 'UPA Central',
      is_personal: false,
      is_admin: true,
      has_workingtime: true,
      has_amount: true,
      total_users: 12,
      memberIds: [USER_ID, 201, 202, 203, 204],
      syncedAt: NOW,
    },
    {
      id: 43,
      name: 'Ambulatório Pediatria',
      color: '#E8A838',
      institutionId: 8,
      institutionName: 'Hospital Municipal',
      is_personal: false,
      is_admin: false,
      has_workingtime: true,
      has_amount: false,
      total_users: 6,
      memberIds: [USER_ID, 203],
      syncedAt: NOW,
    },
  ],
};

// ── 6. aurora_persons ─────────────────────────────────────────────────────────
// { persons: { [personId]: Person } }

const PERSONS_DATA = {
  userId: USER_ID,
  syncedAt: NOW,
  persons: {
    '201': {
      id: 201,
      name: 'Dra. Carla Mendes',
      photo: null,
      role: 'Médica',
      council: 'CRM-SP 98765',
      institution: 'UPA Central',
    },
    '202': {
      id: 202,
      name: 'Dr. Fábio Souza',
      photo: null,
      role: 'Médico',
      council: 'CRM-SP 45321',
      institution: 'UPA Central',
    },
    '203': {
      id: 203,
      name: 'Enf. Rita Alves',
      photo: null,
      role: 'Enfermeira',
      council: 'COREN-SP 112233',
      institution: 'Hospital Municipal',
    },
    '204': {
      id: 204,
      name: 'Dr. Lucas Ferreira',
      photo: null,
      role: 'Médico Residente',
      council: 'CRM-SP 77001',
      institution: 'UPA Central',
    },
  },
};

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\nSeeding Firestore (project: ${FIREBASE_CONFIG.projectId}, userId: ${USER_ID}, month: ${MONTH_KEY})\n`);

try {
  await write('aurora_shifts',    DOC_ID,         SHIFTS_DATA);
  await write('aurora_te',        DOC_ID,         TIME_ENTRIES_DATA);
  await write('aurora_summaries', DOC_ID,         SUMMARY_DATA);
  await write('aurora_users',     String(USER_ID), FINANCIAL_CONFIG_DATA);
  await write('aurora_groups',    String(USER_ID), GROUPS_DATA);
  await write('aurora_persons',   String(USER_ID), PERSONS_DATA);

  console.log('\n✅ All collections seeded successfully.\n');
  console.log('Collections created:');
  console.log('  aurora_shifts    → monthly shift schedule (daysWithShifts[])');
  console.log('  aurora_te        → time entries (actual start/end per shift)');
  console.log('  aurora_summaries → materialized monthly totals + config snapshot');
  console.log('  aurora_users     → financial config (hourly rates, bonuses, loyalty)');
  console.log('  aurora_groups    → user\'s group list with member IDs');
  console.log('  aurora_persons   → coworker/person cache (flat map by personId)');
} catch (err) {
  console.error('\n❌ Seed failed:', err.code, err.message);
} finally {
  await deleteApp(app);
  process.exit(0);
}
