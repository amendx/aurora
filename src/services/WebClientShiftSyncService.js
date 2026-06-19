import LocalCache from './LocalCache';
import FirebaseAdapter from './firebase/FirebaseAdapter';

const monthKeyFor = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const parseMonthKey = (monthKey) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
};

const buildSyncWindowMonthKeys = (now, pastMonths, futureMonths) => {
  const keys = [];
  for (let offset = -pastMonths; offset <= futureMonths; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    keys.push(monthKeyFor(d));
  }
  return keys;
};

export const syncWebClientShifts = async ({
  userId,
  loadMonthlyShifts,
  localCache = LocalCache,
  firebaseAdapter = FirebaseAdapter,
  now = new Date(),
  pastMonths = 3,
  futureMonths = 1,
  webClientToken = null,
}) => {
  if (!userId) throw new Error('Usuário não identificado.');
  if (typeof loadMonthlyShifts !== 'function') throw new Error('Carregador de plantões indisponível.');

  const currentMonthKey = monthKeyFor(now);
  const [localMonthKeys, firebaseMonthKeys] = await Promise.all([
    localCache.getShiftMonthKeys(userId),
    firebaseAdapter.getWebClientMonthKeys(userId),
  ]);
  const allMonthKeys = [...new Set([
    ...buildSyncWindowMonthKeys(now, pastMonths, futureMonths),
    ...(localMonthKeys || []),
    ...(firebaseMonthKeys || []),
  ])].sort();
  const monthKeys = [
    ...allMonthKeys.filter(monthKey => monthKey !== currentMonthKey),
    currentMonthKey,
  ];

  const localRemoved = await localCache.clearShifts(userId, monthKeys);
  const firebaseResult = await firebaseAdapter.deleteWebClientShiftCache(userId, monthKeys, { webClientToken });

  const loadedMonthKeys = [];
  let firebaseWrittenShifts = 0;
  const firebaseWriteErrors = [];
  for (const monthKey of monthKeys) {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) continue;
    await loadMonthlyShifts(parsed.month, parsed.year, true);
    loadedMonthKeys.push(monthKey);
    const refreshed = await localCache.getShifts(userId, monthKey);
    const writeResult = await firebaseAdapter.replaceWebClientMonthShifts(
      userId,
      monthKey,
      refreshed?.daysWithShifts || [],
      refreshed?.syncedAt || null,
      { webClientToken },
    );
    if (writeResult?.success) {
      firebaseWrittenShifts += writeResult.writtenShifts || 0;
    } else {
      firebaseWriteErrors.push({ monthKey, error: writeResult?.error || 'Falha ao gravar no Firebase.' });
    }
  }

  return {
    monthKeys,
    loadedMonthKeys,
    localRemoved,
    firebaseCleanupOk: firebaseResult?.success !== false,
    firebaseCleanupError: firebaseResult?.success === false ? firebaseResult.error : null,
    firebaseDeletedShifts: firebaseResult?.deletedShifts || 0,
    firebaseDeletedMonths: firebaseResult?.deletedMonths || 0,
    firebaseWriteOk: firebaseWriteErrors.length === 0,
    firebaseWriteErrors,
    firebaseWrittenShifts,
  };
};

export default {
  syncWebClientShifts,
};
