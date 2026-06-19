import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import WebClientApiService from '../services/WebClientApiService';
import LocalCache, { isMonthStale } from '../services/LocalCache';
// V2 resolves financial config per-shift via HospitalConfigResolver so
// each hospital's overrides (hour values, bonus, friday-night rule, loyalty)
// take precedence over the global FinancialConfig. Rollback to the original
// global-only behaviour by switching this import back to '../utils/MonthSummaryComputer'.
import { computeMonthSummary } from '../utils/MonthSummaryComputerV2';
import { buildHybridConfig, isPastMonthKey } from '../utils/HospitalConfigResolver';
import { applyPublishedHospitalConfigs, collectInstIds } from '../utils/PublishedHospitalConfig';
import { applyLuisFrancaPreset } from '../utils/LuisFrancaPreset';

/**
 * Build the config to recompute a month's summary with.
 *
 * First overlays the manager-published hospital configs (institutions/{id}.config,
 * the SOURCE OF TRUTH for money at each hospital) onto the live config, so both
 * current and past months price each shift with its hospital's published rates.
 *
 * Then, for past months, bonus + loyalty come from the prior saved summary's
 * snapshot (frozen) while hour values + friday-night rule stay live (retroactive
 * by design — buildHybridConfig). Current/future months use the live config.
 */
const _resolveSummaryConfig = async (userId, fullMonthKey, liveConfig, daysWithShifts, viewOnly = false) => {
  const instIds = collectInstIds(daysWithShifts);
  let live = await applyPublishedHospitalConfigs(liveConfig, instIds);
  if (isPastMonthKey(fullMonthKey)) {
    try {
      const prior = await LocalCache.getSummary(userId, fullMonthKey);
      const snap = prior?.financialConfigSnapshot;
      if (snap) live = buildHybridConfig(live, snap);
    } catch (_) {}
  }
  // Preset LUIS FRANÇA é fórmula fixa: aplica POR ÚLTIMO pra vencer o freeze do
  // snapshot de mês passado (senão a fidelização/taxas congeladas divergem entre
  // dispositivos conforme qual salvou o summary primeiro). timeEntries entram pra
  // faixa de fidelização ser por horas reais (incl. extras), não planejadas.
  const teForLoyalty = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
  live = applyLuisFrancaPreset(live, daysWithShifts, viewOnly, teForLoyalty);
  return live;
};
import { getFullShiftConfig } from '../utils/ShiftValueCalculator';
import TimeUtils from '../utils/TimeUtils';
import Logger from '../utils/Logger';
import { AuthContext } from '../context/AuthContext';
import TodayCoworkersService from '../services/TodayCoworkersService';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { makeLogEntry, TRANSFER_LOG_TYPES } from '../utils/shiftTransferLog';
import { isAuroraOnly, isViewOnly } from '../utils/userSource';

// Context para gerenciar dados dos plantões globalmente (APENAS MONTHLY)
const ShiftsContext = createContext({});

const _plannedMinutesOfShift = (shift) => {
  if (shift?.splitHours?.minutesThisMonth != null) return shift.splitHours.minutesThisMonth;
  if (shift?.splitHours?.hoursThisMonth != null) return shift.splitHours.hoursThisMonth * 60;
  if (typeof shift?.durationMinutes === 'number' && shift.durationMinutes > 0) return shift.durationMinutes;
  const type = shift?.carryover ? 'N' : (shift?.label?.charAt(0) || 'M');
  const timeStr = shift?.time || '';
  let parts = timeStr.split(' – ');
  if (parts.length !== 2) parts = timeStr.split(' - ');
  if (parts.length === 2) {
    const norm = t => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
    const minutes = TimeUtils.calculateDurationMinutes(norm(parts[0]), norm(parts[1]));
    if (minutes !== null && minutes > 0) return minutes;
  }
  return TimeUtils.getShiftStandardMinutes(shift?.label) || (type === 'N' ? 12 * 60 : 6 * 60);
};

// Merge local + remote time entries by latest edit. Used to hydrate registered
// hours (incl. horas extras) from Firestore so they follow the user across devices.
const _entryTs = (e) => Date.parse(e?.updatedAt || e?.editedAt || 0) || 0;
const _mergeTimeEntries = (local = {}, remote = {}) => {
  const out = { ...(local || {}) };
  for (const [id, rem] of Object.entries(remote || {})) {
    const loc = out[id];
    if (!loc || _entryTs(rem) > _entryTs(loc)) out[id] = rem;
  }
  return out;
};

// Pull a month's time entries from Firestore and merge into LocalCache.
// No-op when Firebase unavailable or nothing remote. Returns merged map.
const _hydrateTimeEntries = async (userId, fullMonthKey) => {
  if (!userId) return {};
  const local = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
  try {
    const remote = await FirebaseAdapter.fetchTimeEntries(userId, fullMonthKey);
    if (remote && Object.keys(remote).length) {
      const merged = _mergeTimeEntries(local, remote);
      await LocalCache.saveTimeEntries(userId, fullMonthKey, merged);
      return merged;
    }
  } catch (err) {
    Logger.warn(`[ShiftsContext] hydrate time entries: ${err?.message}`);
  }
  return local;
};

const _buildHoursReport = (daysWithShifts, timeEntries = {}, storedReport = null) => {
  const breakdown = { M: { count: 0, hours: 0 }, T: { count: 0, hours: 0 }, N: { count: 0, hours: 0 } };
  let totalShifts = 0;
  let standardMinutes = 0;
  let extraMinutes = 0;
  const hasEntries = Object.keys(timeEntries || {}).length > 0;
  (daysWithShifts || []).forEach(day => {
    (day.shifts || []).forEach(shift => {
      totalShifts++;
      const type = shift?.carryover ? 'N' : (shift?.label?.charAt(0) || 'M');
      if (!breakdown[type]) breakdown[type] = { count: 0, hours: 0 };
      const plannedMin = _plannedMinutesOfShift(shift);
      standardMinutes += plannedMin;
      breakdown[type].count++;
      breakdown[type].hours += plannedMin / 60;
      const entry = timeEntries?.[shift.id];
      if (entry?.actualDurationMinutes) {
        const diff = entry.actualDurationMinutes - plannedMin;
        if (diff > 0) extraMinutes += diff;
      }
    });
  });
  if (!hasEntries && storedReport) {
    extraMinutes = Math.max(0, ((storedReport.realHours || 0) - (storedReport.standardHours || 0)) * 60);
  }
  const standardHours = standardMinutes / 60;
  return { ...(storedReport || {}), totalShifts, standardHours, realHours: standardHours + (extraMinutes / 60), breakdown };
};

const _patchHoursReport = (storedReport, daysWithShifts) => {
  return _buildHoursReport(daysWithShifts, {}, storedReport);
};

// [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
// Overlay de plantões aurora "órfãos" sobre os dias vindos do PlantaoAPI.
// Quando user.auroraSnapshotAt existe (= user já passou pelo aurora-only),
// Firestore pode ter plantões que NÃO existem no PlantaoAPI:
//   - source 'received' (trocas/cessões aceitas em modo aurora-only)
//   - source 'aurora' isManual (criados manualmente)
//   - source 'aurora' isFixedSchedule (escala fixa criada no app)
// Esses ficam visíveis com source aurora e podem ser cedidos/trocados normalmente.
// Shifts com snapshotFromWebClient:true são descartados (duplicariam o webClient).
const _mergeAuroraOverlay = async (userId, daysWithShifts, fullMonthKey) => {
  if (!userId || !fullMonthKey) return daysWithShifts;
  try {
    const { manualShifts, regularShifts } = await FirebaseAdapter.fetchAuroraMonth(userId, fullMonthKey);
    const auroraOrphans = [...(manualShifts || []), ...(regularShifts || [])]
      .filter(sh => sh && sh.snapshotFromWebClient !== true);
    if (auroraOrphans.length === 0) return daysWithShifts;

    const keyOf = (sh) => `${sh.date || (sh.startISO || '').slice(0, 10)}_${sh.label || ''}_${sh.group?.id || ''}`;
    const wcKeys = new Set();
    const wcIds = new Set();
    (daysWithShifts || []).forEach(d => (d.shifts || []).forEach(sh => {
      wcKeys.add(keyOf(sh));
      if (sh?.id != null) wcIds.add(String(sh.id));
    }));

    // group orphans by date so we know which day to push into / create.
    const byDate = {};
    for (const sh of auroraOrphans) {
      if (sh?.id != null && wcIds.has(String(sh.id))) continue; // já existe (merge anterior)
      if (wcKeys.has(keyOf(sh))) continue; // webClient wins por (date+label+group)
      const date = sh.date || (sh.startISO || '').slice(0, 10);
      if (!date) continue;
      (byDate[date] = byDate[date] || []).push(sh);
    }
    if (Object.keys(byDate).length === 0) return daysWithShifts;

    const mapByDate = {};
    (daysWithShifts || []).forEach(d => { mapByDate[d.date] = d; });
    for (const [date, list] of Object.entries(byDate)) {
      if (mapByDate[date]) {
        mapByDate[date] = {
          ...mapByDate[date],
          shifts: [...(mapByDate[date].shifts || []), ...list],
          shiftsCount: (mapByDate[date].shiftsCount || 0) + list.length,
        };
      } else {
        const d = new Date(date + 'T00:00:00');
        mapByDate[date] = {
          day: d.getDate(),
          date,
          shifts: list,
          shiftsCount: list.length,
          originalData: null,
        };
      }
    }
    return Object.values(mapByDate).sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    Logger.warn(`_mergeAuroraOverlay falhou: ${err?.message}`);
    return daysWithShifts;
  }
};

const _manualShiftsToDaysWithShifts = (manualShifts) => {
  const dayMap = {};
  (manualShifts || []).forEach(shift => {
    if (!dayMap[shift.date]) {
      const d = new Date(shift.date + 'T00:00:00');
      dayMap[shift.date] = { day: d.getDate(), date: shift.date, shiftsCount: 0, shifts: [], originalData: null };
    }
    dayMap[shift.date].shifts.push(shift);
    dayMap[shift.date].shiftsCount++;
  });
  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
};

export const ShiftsProvider = ({ children }) => {
  const { token, user } = useContext(AuthContext);
  // userId is needed to scope LocalCache keys per user.
  // user?.id covers real logins; user?.data?.id covers mock token response shape.
  const userId = user?.id || user?.data?.id || 0;

  // Ref pra sempre apontar pro user mais recente. Necessário porque
  // _loadMonthlyShiftsImpl é capturado em closures que callers de fora podem
  // disparar antes do próximo re-render — sem ref, eles enxergariam a versão
  // anterior do user (e ex. auroraOnlyMode=false logo após o toggle).
  const userRef = useRef(user);
  userRef.current = user;

  // In-memory cache: { 'YYYY-M': { daysWithShifts, hoursReport, totalShifts } }
  const monthsCache = useRef({});

  // Dedup concurrent loads for the same month — multiple callers (HomeScreen,
  // CalendarScreen, ShiftsContext auto-load effect) all mount together and
  // would otherwise fire 3× parallel monthly+daily fetches before state flips.
  const inFlightRef = useRef({});

  // Estado global dos plantões
  const [shiftsData, setShiftsData] = useState({
    currentMonth: null,
    currentYear: null,
    monthlyCalendar: null,
    daysWithShifts: [],
    totalShifts: 0,
    loading: false,
    error: null,
    lastUpdated: null,
    loadedFor: null, // "YYYY-M" — tracks which month was fully loaded (even if 0 shifts)
    monthSummary: null,
  });

  // Helper: parse "19h00 - 07h00 (N)" and return split info for month-boundary night shifts
  const computeSplitHours = (timeStr) => {
    if (!timeStr) return null;
    
    let parts = timeStr.split(' – ');
    if (parts.length !== 2) parts = timeStr.split(' - ');
    if (parts.length !== 2) return null;

    const normalize = (t) => t.replace('h', ':').replace(/\s*\([^)]*\)/, '').trim();
    const [sh, sm] = normalize(parts[0]).split(':').map(Number);
    const [eh, em] = normalize(parts[1]).split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    
    if (endMin >= startMin) return null; // doesn't cross midnight

    const minutesThisMonth = 24 * 60 - startMin;
    const minutesNextMonth = endMin;
    return {
      minutesThisMonth,
      minutesNextMonth,
      // CORRIGIDO: Usar conversão adequada de minutos para horas decimais
      hoursThisMonth: minutesThisMonth / 60,
      hoursNextMonth: minutesNextMonth / 60,
    };
  };

  // Carregar dados dos plantões para um mês específico (APENAS MONTHLY)
  const loadMonthlyShifts = (month, year, forceReload = false) => {
    const _monthKey = `${year}-${month}`;
    if (!forceReload && inFlightRef.current[_monthKey]) {
      return inFlightRef.current[_monthKey];
    }
    const promise = _loadMonthlyShiftsImpl(month, year, forceReload).finally(() => {
      if (inFlightRef.current[_monthKey] === promise) delete inFlightRef.current[_monthKey];
    });
    inFlightRef.current[_monthKey] = promise;
    return promise;
  };

  const _loadMonthlyShiftsImpl = async (month, year, forceReload = false) => {
    // Aurora users have no WebClient/PlantaoAPI backing — Firestore is source of truth.
    // Hydrate LocalCache from Firestore (both manual + regular shifts), then render.
    // [WEBCLIENT-BRIDGE] `|| user?.auroraOnlyMode` rotea webClient migrado
    // pelo mesmo caminho aurora. Remova com o resto da bridge.
    // userRef pra sempre ler o user mais recente — após setAuroraOnlyMode(true),
    // callers podem chamar antes de ShiftsContext re-renderizar.
    const _user = userRef.current;
    if (isAuroraOnly(_user)) {
      const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
      const memKey = `${year}-${month}`;

      if (userId) {
        try {
          const remote = await FirebaseAdapter.fetchAuroraMonth(userId, fullMonthKey);
          // Authoritative reads → Firestore is source of truth, replace cache.
          // Non-authoritative (network/permission error) → leave local as-is.
          if (remote.manualAuthoritative)  await LocalCache.setManualShifts(userId, fullMonthKey, remote.manualShifts);
          if (remote.regularAuthoritative) await LocalCache.saveRegularShifts(userId, fullMonthKey, remote.regularShifts);
        } catch (err) {
          Logger.warn(`[ShiftsContext] aurora hydration failed: ${err?.message}`);
        }
      }

      const [manualShifts, regularShifts] = userId
        ? await Promise.all([
            LocalCache.getManualShifts(userId, fullMonthKey),
            LocalCache.getRegularShifts(userId, fullMonthKey),
          ])
        : [[], []];

      // [WEBCLIENT-BRIDGE] Snapshots antigos podem não ter startISO/endISO,
      // que ShiftBottomSheet usa pra gate de Ceder/Trocar (`startTs > now`).
      // Calcula a partir de date+time se faltar.
      const _ensureISOs = (sh) => {
        if (sh?.startISO && sh?.endISO) return sh;
        const date = sh?.date;
        const tstr = sh?.time || '';
        let parts = tstr.split(' – ');
        if (parts.length !== 2) parts = tstr.split(' - ');
        if (!date || parts.length !== 2) return sh;
        const norm = s => s.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
        const startHM = norm(parts[0]);
        const endHM = norm(parts[1]);
        const [sh1, sm] = startHM.split(':').map(Number);
        const [eh, em] = endHM.split(':').map(Number);
        if ([sh1, sm, eh, em].some(isNaN)) return sh;
        const crossesMidnight = (eh * 60 + em) < (sh1 * 60 + sm);
        const startISO = `${date}T${startHM}:00`;
        let endISO;
        if (crossesMidnight) {
          const next = new Date(date + 'T00:00:00');
          next.setDate(next.getDate() + 1);
          endISO = `${next.toISOString().slice(0, 10)}T${endHM}:00`;
        } else {
          endISO = `${date}T${endHM}:00`;
        }
        return { ...sh, startISO, endISO, crossesMidnight };
      };
      const allShifts = [...manualShifts, ...regularShifts].map(_ensureISOs);
      const daysWithShifts = _manualShiftsToDaysWithShifts(allShifts);
      const auroraTimeEntries = userId
        ? await _hydrateTimeEntries(userId, fullMonthKey)
        : {};
      const hoursReport = _buildHoursReport(daysWithShifts, auroraTimeEntries, null);
      monthsCache.current[memKey] = { daysWithShifts, hoursReport, totalShifts: allShifts.length };
      // Compute and persist summary
      let auroraMonthSummary = null;
      try {
        const [liveConfig, timeEntries] = await Promise.all([
          getFullShiftConfig(),
          LocalCache.getTimeEntries(userId, fullMonthKey),
        ]);
        const financialConfig = await _resolveSummaryConfig(userId, fullMonthKey, liveConfig, daysWithShifts, isViewOnly(_user));
        auroraMonthSummary = computeMonthSummary(userId, fullMonthKey, daysWithShifts, timeEntries || {}, financialConfig);
        await LocalCache.saveSummary(userId, fullMonthKey, auroraMonthSummary);
      } catch (_) {}
      setShiftsData(prev => ({
        ...prev,
        currentMonth: month,
        currentYear: year,
        daysWithShifts,
        hoursReport,
        totalShifts: allShifts.length,
        monthSummary: auroraMonthSummary,
        loading: false,
        error: null,
        loadedFor: memKey,
      }));
      return;
    }

    const monthKey = `${year}-${month}`;

    // 1. In-memory cache (fastest — same session, no async)
    if (!forceReload && monthsCache.current[monthKey]) {
      const cached = monthsCache.current[monthKey];
      const fullMonthKeyForSummary = `${year}-${String(month).padStart(2, '0')}`;
      const timeEntries = userId
        ? (await LocalCache.getTimeEntries(userId, fullMonthKeyForSummary).catch(() => ({}))) || {}
        : {};
      const hoursReport = _buildHoursReport(cached.daysWithShifts, timeEntries, cached.hoursReport);
      monthsCache.current[monthKey] = { ...cached, hoursReport };
      setShiftsData(prev => ({
        ...prev,
        ...cached,
        hoursReport,
        currentMonth: month,
        currentYear: year,
        loading: false,
        loadedFor: monthKey,
        monthSummary: null,
      }));
      if (userId) {
        LocalCache.getSummary(userId, fullMonthKeyForSummary)
          .then(s => { if (s) setShiftsData(prev => prev.loadedFor === monthKey ? { ...prev, monthSummary: s } : prev); })
          .catch(() => {});
      }
      // Ensure coworkers are computed even when shifts come from memory cache
      if (token && !TodayCoworkersService.isReady(userId)) {
        TodayCoworkersService.compute(userId, token, userId).catch(() => {});
      }
      return;
    }

    // 2. Persistent LocalCache (survives app restarts — no API call if fresh)
    if (!forceReload && userId) {
      const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
      const persisted = await LocalCache.getShifts(userId, fullMonthKey);
      if (persisted && !isMonthStale(persisted.syncedAt, fullMonthKey)) {
        Logger.info('📦 Restaurando do LocalCache para', fullMonthKey, '(syncedAt:', persisted.syncedAt, ')');
        const { daysWithShifts, hoursReport: rawReport } = persisted;
        const timeEntries = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
        const hoursReport = _buildHoursReport(daysWithShifts, timeEntries, rawReport);
        // saveShifts doesn't persist totalShifts — derive from daysWithShifts
        // so the cache stays consistent with the actual list.
        const totalShifts = (daysWithShifts || []).reduce(
          (sum, d) => sum + (d.shifts?.length || 0), 0
        );
        // Warm up in-memory cache so subsequent tab switches are instant
        monthsCache.current[monthKey] = { daysWithShifts, hoursReport, totalShifts };
        let cachedMonthSummary = null;
        try { cachedMonthSummary = await LocalCache.getSummary(userId, fullMonthKey); } catch {}
        setShiftsData(prev => ({
          ...prev,
          currentMonth: month,
          currentYear: year,
          daysWithShifts: daysWithShifts || [],
          totalShifts,
          hoursReport: hoursReport || null,
          loading: false,
          error: null,
          lastUpdated: persisted.syncedAt ? new Date(persisted.syncedAt) : null,
          loadedFor: monthKey,
          monthSummary: cachedMonthSummary,
        }));
        // Ensure coworkers are computed even when shifts come from cache
        if (token && !TodayCoworkersService.isReady(userId)) {
          TodayCoworkersService.compute(userId, token, userId).catch(() => {});
        }
        return;
      }
    }

    // Evitar recarregar se já está carregando o mesmo mês
    if (shiftsData.loading && shiftsData.currentMonth === month && shiftsData.currentYear === year) {
      return;
    }


    // Limpar dados do mês anterior imediatamente para evitar UI stale
    const switchingMonth = shiftsData.currentMonth !== month || shiftsData.currentYear !== year;
    setShiftsData(prev => ({
      ...prev,
      loading: true,
      error: null,
      daysWithShifts: switchingMonth ? [] : prev.daysWithShifts,
      loadedFor: switchingMonth ? null : prev.loadedFor,
    }));

    try {
      Logger.info(`📅 Chamando endpoint monthly: ${month}/${year}`);
      
      // PASSO 1: Buscar apenas o calendário mensal
      const monthlyResponse = await WebClientApiService.getMonthlyCalendar(token, month, year);
      
      if (!monthlyResponse.success) {
        throw new Error(monthlyResponse.error || 'Erro ao carregar calendário');
      }

      const monthlyData = monthlyResponse.data;

      // PASSO 2: Processar os dados do monthly. O campo `current` da PlantaoAPI
      // reflete a noção do SERVIDOR de "mês corrente", que pode estar dessincronizada
      // do mês pedido na URL (cache server-side, timezone, virada de mês). Em vez
      // de confiar nele, procuramos os dias do mês solicitado em current/previous/next
      // filtrando por `date`.
      if (!monthlyData.data) {
        throw new Error('Estrutura de dados do monthly inválida');
      }
      const fullMonthKeyForFilter = `${year}-${String(month).padStart(2, '0')}`;
      const _allReturnedDays = [
        ...(Array.isArray(monthlyData.data?.previous?.days) ? monthlyData.data.previous.days : []),
        ...(Array.isArray(monthlyData.data?.current?.days)  ? monthlyData.data.current.days  : []),
        ...(Array.isArray(monthlyData.data?.next?.days)     ? monthlyData.data.next.days     : []),
      ];
      const currentMonthDays = _allReturnedDays.filter(
        d => typeof d?.date === 'string' && d.date.startsWith(fullMonthKeyForFilter)
      );
      if (currentMonthDays.length === 0) {
        Logger.warn(`[ShiftsContext] monthly API não retornou dias para ${fullMonthKeyForFilter} (current.days vinha de outro mês?)`);
      }

      // PASSO 3: Buscar detalhes diários para cada dia com plantões
      const daysWithShifts = [];

      for (const dayData of currentMonthDays) {
        const day = parseInt(dayData.date.split('-')[2]);
        const shiftsCount = dayData.shifts ? dayData.shifts.length : 0;

        let shifts = [];

        {
          const dateObj = new Date(dayData.date + 'T12:00:00.000Z');
          const dailyResponse = await WebClientApiService.getDailyShifts(token, dateObj);

          if (dailyResponse.success && dailyResponse.data && dailyResponse.data.length > 0) {
            // Log do primeiro item para diagnóstico de estrutura da API real
            // if (dailyResponse.data[0]) {
            //   Logger.info(`🔬 Estrutura raw do daily (${dayData.date}): ${JSON.stringify(dailyResponse.data[0])}`);
            // }

            shifts = dailyResponse.data.map(shiftData => {
              // Detectar label com precedência correta — sem bug de ternário
              const detectLabel = () => {
                if (shiftData.label) return shiftData.label;
                if (shiftData.shift_type) return shiftData.shift_type;
                if (shiftData.type) return shiftData.type;
                const t = (shiftData.time || shiftData.schedule || shiftData.hours || '');
                // Noturno: começa >= 18h ou 19h
                if (/1[89][:h]/.test(t) || /2[0-3][:h]/.test(t)) return 'N';
                // Tarde: começa >= 13h
                if (/1[3-7][:h]/.test(t)) return 'T';
                return 'M';
              };
              const label = detectLabel();

              return {
                id: shiftData.id,
                label: typeof label === 'string' ? label : 'M',
                time: shiftData.time || shiftData.schedule || shiftData.hours || '',
                date: dayData.date,
                group: shiftData.group || { name: shiftData.group_name || 'Sem grupo' },
                originalData: shiftData,
              };
            });

          } else {
            // API não retornou detalhes → montar placeholder com IDs do monthly
            shifts = (dayData.shifts || []).map(shiftId => ({
              id: shiftId,
              label: 'M',
              time: '',
              date: dayData.date,
              group: { name: '' },
            }));
            Logger.warn(`⚠️ ${dayData.date}: sem detalhes da API daily (${shiftsCount} IDs do monthly)`);
          }
        }

        // Detect month-boundary split for night shifts on the last day of the month
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        if (day === lastDayOfMonth) {
          shifts = shifts.map(shift => {
            if (shift.label?.charAt(0) !== 'N') return shift;
            const split = computeSplitHours(shift.time);
            if (!split) return shift;
            Logger.info(`🌙 Split shift detected on day ${day}: ${split.hoursThisMonth}h this month, ${split.hoursNextMonth}h next month`);
            return { ...shift, splitHours: split };
          });
        }

        daysWithShifts.push({
          day,
          shiftsCount,
          shifts,
          date: dayData.date,
          originalData: dayData,
        });
      }

      // ── Day-1 carryover: inject derived shift from previous month's last night ──
      // Procura o último dia do mês anterior em qualquer bucket retornado pela API
      // (current/previous/next), pelos mesmos motivos do filtro acima — não dá pra
      // confiar que `previous.days` realmente contém o mês anterior solicitado.
      {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const lastDayOfPrevMonth = new Date(prevYear, prevMonth, 0).getDate(); // Day 0 = last day of previous month
        const expectedLastDay = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

        const prevLastDay = _allReturnedDays.find(d => d?.date === expectedLastDay);

        if (prevLastDay) {
          // Try to get the actual shift detail for that day from the API
          let prevNightShifts = [];

          {
            const dateObj = new Date(prevLastDay.date + 'T12:00:00.000Z');
            const resp = await WebClientApiService.getDailyShifts(token, dateObj);
            if (resp.success && resp.data) {
              prevNightShifts = resp.data
                .filter(s => (s.label || '').charAt(0) === 'N')
                .map(s => ({ ...s, date: prevLastDay.date }));
            }
          }
          
          for (const prevShift of prevNightShifts) {
            
            const split = computeSplitHours(prevShift.time || prevShift.schedule || '');
            
            if (!split) {
              continue;
            }

            // Build the carryover end time string, e.g. "00h00 - 07h00"
            const normalize = (t) => t.replace('h', ':').replace(/\s*\([^)]*\)/, '').trim();
            let parts = (prevShift.time || '').split(' – ');
            if (parts.length !== 2) parts = (prevShift.time || '').split(' - ');
            const endTimeRaw = parts.length === 2 ? normalize(parts[1]) : null;
            const carryoverTime = endTimeRaw
              ? `00h00 - ${endTimeRaw.replace(':', 'h').replace(/^(\d):/, '0$1:')}`
              : `00h00 - ${String(Math.floor(split.minutesNextMonth / 60)).padStart(2,'0')}h${String(split.minutesNextMonth % 60).padStart(2,'0')}`;

            const derivedShift = {
              id: `carry_${prevShift.id || prevLastDay.date}`,
              label: 'D', // D = Divided (carryover)
              time: carryoverTime,
              date: `${year}-${String(month).padStart(2, '0')}-01`,
              group: prevShift.group || { name: prevShift.group_name || 'Sem grupo' },
              carryover: true, // marks this as a derived carryover shift
              splitHours: {
                minutesThisMonth: split.minutesNextMonth,
                minutesNextMonth: 0,
                hoursThisMonth: split.hoursNextMonth,
                hoursNextMonth: 0,
              },
              originalLabel: 'N',
              originalTime: prevShift.time,
            };

            // Inject into day 1 if it exists, otherwise create a day-1 entry
            const day1Idx = daysWithShifts.findIndex(d => d.day === 1);
            if (day1Idx >= 0) {
              daysWithShifts[day1Idx] = {
                ...daysWithShifts[day1Idx],
                shifts: [derivedShift, ...daysWithShifts[day1Idx].shifts],
                shiftsCount: daysWithShifts[day1Idx].shiftsCount + 1,
              };
            } else {
              const day1Date = `${year}-${String(month).padStart(2, '0')}-01`;
              daysWithShifts.unshift({
                day: 1,
                shiftsCount: 1,
                shifts: [derivedShift],
                date: day1Date,
                originalData: null,
              });
            }

          }
        } else {
          Logger.info(`🔍 CARRYOVER: No prevLastDay found for ${expectedLastDay} in API response`);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // Log resumo de todos os plantões do mês
      Logger.info(`\n📅 ===== PLANTÕES DE ${month}/${year} =====`);
      daysWithShifts.forEach(d => {
        if (d.shifts.length > 0) {
          Logger.info(`  ${d.date} (${d.shifts.length}): ${d.shifts.map(s => `[${s.label}] ${s.time}`).join(' | ')}`);
        }
      });
      Logger.info(`📅 =======================================\n`);

      const totalShifts = daysWithShifts.reduce((sum, day) => sum + day.shiftsCount, 0);
      // PASSO 4: Calcular estatísticas REAIS baseadas nos turnos da API
      const realBreakdown = { M: { count: 0, hours: 0 }, T: { count: 0, hours: 0 }, N: { count: 0, hours: 0 } };
      
      daysWithShifts.forEach(day => {
        day.shifts.forEach(shift => {
          // Carryover 'D' shifts count as 'N' for stats purposes
          const type = shift.carryover ? 'N' : (shift.label?.charAt(0) || shift.label || 'M');
          if (!realBreakdown[type]) realBreakdown[type] = { count: 0, hours: 0 };
          realBreakdown[type].count++;
          
          // Use split hours when available (both end-of-month and carryover shifts)
          let hours = 0;
          if (shift.splitHours) {
            hours = shift.splitHours.hoursThisMonth;
          } else {
            // Parse actual duration from shift.time string (e.g. "07h00 – 13h00 (M)")
            const timeStr = shift.time || '';
            let parts = timeStr.split(' – ');
            if (parts.length !== 2) parts = timeStr.split(' - ');
            if (parts.length === 2) {
              const norm = t => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
              const actualMin = TimeUtils.calculateDurationMinutes(norm(parts[0]), norm(parts[1]));
              if (actualMin !== null && actualMin > 0) hours = actualMin / 60;
            }
            if (!hours) hours = type === 'N' ? 12 : 6; // fallback
          }
          
          realBreakdown[type].hours += hours;
        });
      });

      // IMPORTANTE: Separar horas previstas de horas reais
      // standardHours = sempre baseado nos plantões cadastrados (NUNCA muda)
      // realHours = horas previstas + horas extras registradas (pode variar)

      const standardHours = realBreakdown.M.hours + realBreakdown.T.hours + realBreakdown.N.hours;

      // Compute hours per institution so loyalty tiers can be auto-resolved per hospital
      const hoursByInstitution = {};
      daysWithShifts.forEach(day => {
        day.shifts.forEach(shift => {
          const iid = String(shift.group?.institution?.id || '');
          if (!iid) return;
          let h = 0;
          if (shift.splitHours) {
            h = shift.splitHours.hoursThisMonth;
          } else {
            const timeStr = shift.time || '';
            let parts = timeStr.split(' – ');
            if (parts.length !== 2) parts = timeStr.split(' - ');
            if (parts.length === 2) {
              const norm = t => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
              const m = TimeUtils.calculateDurationMinutes(norm(parts[0]), norm(parts[1]));
              if (m !== null && m > 0) h = m / 60;
            }
            if (!h) h = (shift.label?.charAt(0) === 'N' || shift.carryover) ? 12 : 6;
          }
          hoursByInstitution[iid] = (hoursByInstitution[iid] || 0) + h;
        });
      });

      // Persist earned loyalty tier per institution to SecureStore + LocalCache + Firestore
      try {
        const loyaltyCfg = await getFullShiftConfig();
        const institutionLoyalty = loyaltyCfg.institutionLoyalty || {};
        if (Object.keys(institutionLoyalty).length > 0) {
          const currentInstitutionLoyalty = {};
          for (const [iid, iloy] of Object.entries(institutionLoyalty)) {
            if (iloy.autoFromHours) {
              const h = hoursByInstitution[iid] || 0;
              const tier = (iloy.loyaltyOptions || [])
                .filter(o => o.minHours <= h)
                .sort((a, b) => b.minHours - a.minHours)[0] || null;
              currentInstitutionLoyalty[iid] = {
                percentage: tier?.percentage || 0,
                minHours: tier?.minHours || 0,
                hoursWorked: h,
                earnedAt: new Date().toISOString(),
              };
            } else {
              currentInstitutionLoyalty[iid] = {
                percentage: iloy.manualPercentage || 0,
                manual: true,
              };
            }
          }
          const updatedCfg = { ...loyaltyCfg, currentInstitutionLoyalty };
          await SecureStore.setItemAsync('shift_configurations', JSON.stringify(updatedCfg));
          if (userId) {
            const existing = await LocalCache.getFinancialConfig(userId);
            await LocalCache.saveFinancialConfig(userId, {
              ...updatedCfg, userId,
              version: (existing?.version || 0) + 1,
              updatedAt: new Date().toISOString(),
            });
            FirebaseAdapter.saveFinancialConfig(userId, { ...updatedCfg, userId }).catch(
              err => Logger.warn('[Firebase] loyalty sync failed:', err?.message)
            );
          }
          Logger.info(`💾 Loyalty tiers computed and saved for ${Object.keys(currentInstitutionLoyalty).length} institutions`);
        }
      } catch (loyaltyErr) {
        Logger.warn('Loyalty auto-compute error:', loyaltyErr?.message);
      }

      // Calcular horas extras registradas pelo usuário.
      // Reads from the correct key format used by ShiftBottomSheet:
      //   real_hours_{YYYY-MM-DD}  →  { [shiftIndex]: { startTime, endTime, ... } }
      // Falls back to LocalCache time entries (post-migration).
      let totalExtras = 0;
      try {
        const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
        // Pull registered hours from Firestore so horas extras follow the user
        // across devices, then read the merged LocalCache result.
        const cachedEntries = userId
          ? await _hydrateTimeEntries(userId, fullMonthKey)
          : {};

        for (const dayData of daysWithShifts) {
          const dateStr = dayData.date;

          // Check LocalCache entries for each shift in this day
          let handledByCache = false;
          for (let i = 0; i < dayData.shifts.length; i++) {
            const shift = dayData.shifts[i];
            const entry = cachedEntries[shift.id];
            if (entry?.actualDurationMinutes) {
              const plannedMin = shift.splitHours?.minutesThisMonth
                ?? TimeUtils.getShiftStandardMinutes(shift.label);
              const extraMin = entry.actualDurationMinutes - plannedMin;
              if (extraMin > 0) totalExtras += extraMin / 60;
              handledByCache = true;
            }
          }

          if (handledByCache) continue;

          // Fallback: read legacy SecureStore key (pre-migration or un-migrated entries).
          // Chave escopada por uid pra não vazar entre sessões. Fallback à chave
          // antiga (sem uid) só pra entradas anteriores ao escopo.
          try {
            const raw = (userId && await SecureStore.getItemAsync(`real_hours_${userId}_${dateStr}`))
              || await SecureStore.getItemAsync(`real_hours_${dateStr}`);
            if (!raw) continue;
            const realHoursMap = JSON.parse(raw);

            for (let i = 0; i < dayData.shifts.length; i++) {
              const shift = dayData.shifts[i];
              const rh = realHoursMap[i];
              if (!rh?.startTime || !rh?.endTime) continue;

              const realMin = TimeUtils.calculateDurationMinutes(rh.startTime, rh.endTime);
              if (realMin === null) continue;

              const plannedMin = shift.splitHours?.minutesThisMonth
                ?? TimeUtils.getShiftStandardMinutes(shift.label);
              const extraMin = realMin - plannedMin;
              if (extraMin > 0) totalExtras += extraMin / 60;
            }
          } catch (legacyErr) {
            Logger.warn(`Erro ao ler real_hours_ legado para ${dateStr}:`, legacyErr?.message);
          }
        }
      } catch (error) {
        Logger.warn('Erro ao calcular horas extras:', error?.message);
      }

      const realHours = standardHours + totalExtras;

      let hoursReport = {
        totalShifts,
        standardHours, // Horas previstas (fixas)
        realHours, // Horas reais (previstas + extras)
        breakdown: realBreakdown
      };

      // Merge Aurora-received shifts (claimed from openings) into the calendar.
      // WebClient API doesn't know about Aurora pool claims — Firestore/LocalCache do.
      if (userId) {
        try {
          const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
          // Hydrate Aurora-received shifts from Firestore so they survive
          // logout/login on webClient users. Authoritative when readable.
          try {
            const remote = await FirebaseAdapter.fetchAuroraMonth(userId, fullMonthKey);
            if (remote.regularAuthoritative) {
              await LocalCache.saveRegularShifts(userId, fullMonthKey, remote.regularShifts);
            }
          } catch (hydrateErr) {
            Logger.warn(`[ShiftsContext] hydrate regular shifts: ${hydrateErr?.message}`);
          }
          const received = await LocalCache.getRegularShifts(userId, fullMonthKey);
          (received || []).forEach(rec => {
            if (!rec?.date) return;
            const idx = daysWithShifts.findIndex(d => d.date === rec.date);
            if (idx >= 0) {
              if (!daysWithShifts[idx].shifts.some(s => String(s.id) === String(rec.id))) {
                daysWithShifts[idx] = {
                  ...daysWithShifts[idx],
                  shifts: [...daysWithShifts[idx].shifts, rec],
                  shiftsCount: daysWithShifts[idx].shiftsCount + 1,
                };
              }
            } else {
              const d = new Date(rec.date + 'T00:00:00');
              daysWithShifts.push({ day: d.getDate(), date: rec.date, shifts: [rec], shiftsCount: 1, originalData: null });
            }
          });
          daysWithShifts.sort((a, b) => a.date.localeCompare(b.date));
        } catch (mergeErr) {
          Logger.warn(`[ShiftsContext] merge aurora regular shifts: ${mergeErr?.message}`);
        }
      }

      // Recount after Aurora-received merge so monthsCache stays consistent
      // with daysWithShifts (totalShifts above was computed pre-merge).
      const mergedTotalShifts = daysWithShifts.reduce(
        (sum, d) => sum + (d.shifts?.length || 0), 0
      );

      // Salvar no cache em memória
      // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
      // Sobrepor plantões aurora "órfãos" (recebidos, manuais, escala fixa) que
      // não têm contrapartida no PlantaoAPI. Só pra usuários que já passaram pelo
      // aurora-only (auroraSnapshotAt presente) — sem custo pros demais.
      let displayDays = daysWithShifts;
      let displayTotal = mergedTotalShifts;
      if (userRef.current?.auroraSnapshotAt && userId) {
        const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
        displayDays = await _mergeAuroraOverlay(userId, daysWithShifts, fullMonthKey);
        displayTotal = displayDays.reduce((acc, d) => acc + (d.shifts?.length || 0), 0);
      }

      if (userId) {
        const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
        const timeEntries = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
        hoursReport = _buildHoursReport(displayDays, timeEntries, hoursReport);
      }

      monthsCache.current[monthKey] = { daysWithShifts: displayDays, hoursReport, totalShifts: displayTotal };

      // Persistir no LocalCache (sobrevive a reinicializações do app)
      if (userId) {
        const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
        const syncedAt = new Date().toISOString();
        var webClientMonthSummary = null;
        try {
          await LocalCache.saveShifts(userId, fullMonthKey, displayDays, syncedAt, hoursReport);

          // Trigger today-coworkers computation now that shifts are in cache
          if (token) {
            TodayCoworkersService.compute(userId, token, userId).catch(() => {});
          }

          // Recompute MonthSummary. For past months, freeze bonus + loyalty
          // from the prior saved snapshot; hour values + friday-night rule
          // come from the live config (retroactive by design).
          const [liveConfig, timeEntries] = await Promise.all([
            getFullShiftConfig(),
            LocalCache.getTimeEntries(userId, fullMonthKey),
          ]);
          const financialConfig = await _resolveSummaryConfig(userId, fullMonthKey, liveConfig, displayDays, isViewOnly(_user));
          webClientMonthSummary = computeMonthSummary(
            userId, fullMonthKey, displayDays, timeEntries || {}, financialConfig
          );
          await LocalCache.saveSummary(userId, fullMonthKey, webClientMonthSummary);
          Logger.info(`💾 LocalCache: ${displayDays.length} dias + summary salvos para ${fullMonthKey}`);
        } catch (cacheErr) {
          Logger.warn('LocalCache: erro ao persistir shifts/summary:', cacheErr?.message);
        }
      }

      Logger.info(`✅ RESULTADO FINAL: ${displayTotal} plantões em ${displayDays.length} dias`);
      Logger.info(`🕐 Total de horas: ${hoursReport.standardHours}h`);

      // Debug detalhado das horas para HomeScreen
      Logger.info('🏠 📊 DEBUG HORAS PARA HOME:');
      Logger.info(`🏠 📈 realHours: ${hoursReport.realHours}h`);

      // PASSO 5: Atualizar estado global
      setShiftsData({
        currentMonth: month,
        currentYear: year,
        monthlyCalendar: monthlyData,
        daysWithShifts: displayDays,
        totalShifts: displayTotal,
        hoursReport,
        monthSummary: typeof webClientMonthSummary !== 'undefined' ? webClientMonthSummary : null,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        loadedFor: `${year}-${month}`,
      });

      Logger.info('🎉 DADOS CARREGADOS COM SUCESSO!');

    } catch (error) {
      Logger.error('❌ Erro ao carregar plantões:', error.message);
      setShiftsData(prev => ({
        ...prev,
        loading: false,
        error: error.message,
        loadedFor: `${year}-${month}`, // prevent retry loop on error
      }));
    }
  };

  // Alias mantido para compatibilidade com HomeScreen
  const loadTwoMonthsData = (month, year) => loadMonthlyShifts(month, year);

  /**
   * Refresh leve (pull-to-refresh). Source-aware:
   *  - aurora: re-lê só do Firestore (loadMonthlyShifts já faz isso pro aurora).
   *  - webClient: 1 chamada getMonthlyCalendar pra detectar mudança de escala.
   *      • Se a contagem por dia NÃO mudou → não chama getDailyShifts; apenas
   *        re-mescla a camada Aurora (trocas/cessões recebidas) do Firestore.
   *      • Se mudou (hospital alterou escala) ou não há cache → reload completo.
   */
  const refreshShifts = async (month, year) => {
    // Aurora (ou [WEBCLIENT-BRIDGE] modo aurora-only): o branch aurora do
    // loadMonthlyShifts sempre re-hidrata do Firestore.
    const _user = userRef.current;
    if (isAuroraOnly(_user)) {
      return loadMonthlyShifts(month, year, true);
    }
    if (!token || !userId) {
      return loadMonthlyShifts(month, year, true);
    }

    const memKey = `${year}-${month}`;
    const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;

    // Cache base pra comparar (memória → LocalCache)
    let cached = monthsCache.current[memKey];
    if (!cached?.daysWithShifts) {
      const persisted = await LocalCache.getShifts(userId, fullMonthKey).catch(() => null);
      if (persisted?.daysWithShifts) {
        cached = { daysWithShifts: persisted.daysWithShifts, hoursReport: persisted.hoursReport };
      }
    }
    if (!cached?.daysWithShifts) {
      // Sem base pra diff → reload completo
      return loadMonthlyShifts(month, year, true);
    }

    try {
      const monthlyResponse = await WebClientApiService.getMonthlyCalendar(token, month, year);
      if (!monthlyResponse?.success) {
        return loadMonthlyShifts(month, year, true);
      }
      // Mesma defesa do loadMonthlyShifts: o `current` do servidor pode estar
      // dessincronizado do mês pedido. Filtra por `date` em todos os buckets.
      const _monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const _data = monthlyResponse?.data?.data;
      const apiDays = [
        ...(Array.isArray(_data?.previous?.days) ? _data.previous.days : []),
        ...(Array.isArray(_data?.current?.days)  ? _data.current.days  : []),
        ...(Array.isArray(_data?.next?.days)     ? _data.next.days     : []),
      ].filter(d => typeof d?.date === 'string' && d.date.startsWith(_monthKey));
      if (apiDays.length === 0) {
        Logger.warn(`[refreshShifts] API não retornou dias para ${_monthKey} — fallback reload`);
        return loadMonthlyShifts(month, year, true);
      }

      // Contagem por dia: API vs cache (ignorando carryover, que é derivado)
      const apiCount = {};
      apiDays.forEach(d => { apiCount[d.date] = d.shifts ? d.shifts.length : 0; });
      const cacheCount = {};
      cached.daysWithShifts.forEach(d => {
        cacheCount[d.date] = (d.shifts || []).filter(s => !s.carryover).length;
      });
      const dates = new Set([...Object.keys(apiCount), ...Object.keys(cacheCount)]);
      let scheduleChanged = false;
      for (const dt of dates) {
        if ((apiCount[dt] || 0) !== (cacheCount[dt] || 0)) { scheduleChanged = true; break; }
      }

      if (scheduleChanged) {
        // Escala do hospital mudou → precisa dos detalhes → reload completo (1+N)
        Logger.info('🔄 refreshShifts: escala mudou, reload completo');
        return loadMonthlyShifts(month, year, true);
      }

      // Escala igual → só atualizar a camada Aurora (trocas/cessões) do Firestore.
      Logger.info('🔄 refreshShifts: escala igual, re-merge Firestore (sem daily calls)');

      // 1. Base = cache sem os plantões da camada Aurora (received).
      const baseDays = cached.daysWithShifts.map(d => ({
        ...d,
        shifts: (d.shifts || []).filter(s => s.source !== 'received'),
      }));

      // 2. Re-ler regular shifts do Firestore (authoritative) e re-mesclar.
      try {
        const remote = await FirebaseAdapter.fetchAuroraMonth(userId, fullMonthKey);
        if (remote.regularAuthoritative) {
          await LocalCache.saveRegularShifts(userId, fullMonthKey, remote.regularShifts);
        }
      } catch (e) {
        Logger.warn(`[refreshShifts] hydrate regular: ${e?.message}`);
      }
      const received = await LocalCache.getRegularShifts(userId, fullMonthKey).catch(() => []);
      (received || []).forEach(rec => {
        if (!rec?.date) return;
        const idx = baseDays.findIndex(d => d.date === rec.date);
        if (idx >= 0) {
          if (!baseDays[idx].shifts.some(s => String(s.id) === String(rec.id))) {
            baseDays[idx] = {
              ...baseDays[idx],
              shifts: [...baseDays[idx].shifts, rec],
            };
          }
        } else {
          const dt = new Date(rec.date + 'T00:00:00');
          baseDays.push({ day: dt.getDate(), date: rec.date, shifts: [rec], shiftsCount: 1, originalData: null });
        }
      });
      baseDays.forEach(d => { d.shiftsCount = (d.shifts || []).length; });
      baseDays.sort((a, b) => a.date.localeCompare(b.date));

      // [WEBCLIENT-BRIDGE] — remove when webClient is fully retired.
      // Overlay de aurora-órfãos (igual ao caminho completo de loadMonthly).
      let mergedDays = baseDays;
      if (userRef.current?.auroraSnapshotAt) {
        mergedDays = await _mergeAuroraOverlay(userId, baseDays, fullMonthKey);
      }
      const totalShifts = mergedDays.reduce((sum, d) => sum + (d.shifts?.length || 0), 0);
      const timeEntries = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
      const hoursReport = _buildHoursReport(mergedDays, timeEntries, cached.hoursReport);
      monthsCache.current[memKey] = { daysWithShifts: mergedDays, hoursReport, totalShifts };
      await LocalCache.saveShifts(userId, fullMonthKey, mergedDays, new Date().toISOString(), hoursReport).catch(() => {});

      setShiftsData(prev => ({
        ...prev,
        currentMonth: month,
        currentYear: year,
        daysWithShifts: mergedDays,
        totalShifts,
        hoursReport,
        loading: false,
        error: null,
        loadedFor: memKey,
      }));
    } catch (err) {
      Logger.warn(`[refreshShifts] falhou, fallback reload: ${err?.message}`);
      return loadMonthlyShifts(month, year, true);
    }
  };

  /**
   * Write time entries for a day into LocalCache and mark the month summary dirty.
   * Called after ShiftBottomSheet saves real hours (via CalendarScreen.handleHoursChanged).
   *
   * @param {string} dateKey    "YYYY-MM-DD"
   * @param {object} hoursMap   { [shiftIndex]: { startTime, endTime, shiftId, ... } }
   * @param {Array}  dayShifts  shift array for that day (from daysWithShifts)
   */
  const persistTimeEntries = async (dateKey, hoursMap, dayShifts) => {
    if (!userId || !dateKey || !hoursMap) return;
    const monthKey = dateKey.slice(0, 7); // "YYYY-MM"
    try {
      const nextTimeEntries = { ...((await LocalCache.getTimeEntries(userId, monthKey).catch(() => ({}))) || {}) };
      const removedIds = [];
      for (let i = 0; i < (dayShifts || []).length; i++) {
        const shift = dayShifts[i];
        const rh = hoursMap[i];
        if (!shift?.id) continue;
        if (!rh?.startTime || !rh?.endTime) {
          if (nextTimeEntries[shift.id]) removedIds.push(shift.id);
          delete nextTimeEntries[shift.id];
          continue;
        }

        const actualDurationMinutes =
          TimeUtils.calculateDurationMinutes(rh.startTime, rh.endTime) ?? 0;

        // Parse scheduled times from shift.time string e.g. "07:00 - 13:00 (M)"
        let scheduledStart = '';
        let scheduledEnd   = '';
        if (shift.time) {
          let parts = shift.time.split(' – ');
          if (parts.length !== 2) parts = shift.time.split(' - ');
          if (parts.length === 2) {
            scheduledStart = parts[0].replace(/\s*\([^)]*\)/, '').trim();
            scheduledEnd   = parts[1].replace(/\s*\([^)]*\)/, '').trim();
          }
        }

        const entry = {
          shiftId:               shift.id,
          userId,
          date:                  dateKey,
          monthKey,
          scheduledStart,
          scheduledEnd,
          actualStart:           rh.startTime,
          actualEnd:             rh.endTime,
          actualDurationMinutes,
          editedAt:              new Date().toISOString(),
        };
        nextTimeEntries[shift.id] = entry;
      }
      await LocalCache.saveTimeEntries(userId, monthKey, nextTimeEntries);
      // saveTimeEntries only upserts; cleared entries must be deleted from
      // Firestore explicitly or they resurrect on the next cross-device hydrate.
      removedIds.forEach(id =>
        FirebaseAdapter.deleteTimeEntry(userId, monthKey, id).catch(() => {})
      );
      await LocalCache.markSummaryDirty(userId, monthKey);
      const memKey = `${Number(monthKey.slice(0, 4))}-${Number(monthKey.slice(5, 7))}`;
      const cached = monthsCache.current[memKey];
      if (cached?.daysWithShifts) {
        const timeEntries = (await LocalCache.getTimeEntries(userId, monthKey).catch(() => ({}))) || {};
        const hoursReport = _buildHoursReport(cached.daysWithShifts, timeEntries, cached.hoursReport);
        monthsCache.current[memKey] = { ...cached, hoursReport };
        await LocalCache.saveShifts(userId, monthKey, cached.daysWithShifts, new Date().toISOString(), hoursReport).catch(() => {});
        setShiftsData(prev => (
          prev.loadedFor === memKey
            ? { ...prev, hoursReport }
            : prev
        ));
      }
      Logger.info(`💾 TimeEntries persisted for ${dateKey}, summary marked dirty`);
    } catch (err) {
      Logger.warn('persistTimeEntries error:', err?.message);
    }
  };

  /**
   * Recompute and persist MonthSummary from current in-memory shifts + LocalCache time entries.
   * No API call — reads from memory cache and LocalCache only.
   * Safe to call after any time entry or financial config change.
   *
   * @param {number} month  1-12
   * @param {number} year
   */
  const refreshMonthSummary = async (month, year) => {
    if (!userId) return;
    const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;
    const memKey       = `${year}-${month}`;
    const cached       = monthsCache.current[memKey];
    if (!cached?.daysWithShifts) {
      Logger.info('refreshMonthSummary: no in-memory data for', fullMonthKey, '— skipping');
      return;
    }
    try {
      const [liveConfig, timeEntries] = await Promise.all([
        getFullShiftConfig(),
        LocalCache.getTimeEntries(userId, fullMonthKey),
      ]);
      const financialConfig = await _resolveSummaryConfig(userId, fullMonthKey, liveConfig, cached.daysWithShifts, isViewOnly(userRef.current));
      const summary = computeMonthSummary(
        userId, fullMonthKey, cached.daysWithShifts, timeEntries || {}, financialConfig
      );
      const hoursReport = _buildHoursReport(cached.daysWithShifts, timeEntries || {}, cached.hoursReport);
      monthsCache.current[memKey] = { ...cached, hoursReport };
      await LocalCache.saveSummary(userId, fullMonthKey, summary);
      await LocalCache.saveShifts(userId, fullMonthKey, cached.daysWithShifts, new Date().toISOString(), hoursReport).catch(() => {});
      setShiftsData(prev => (
        prev.loadedFor === memKey
          ? { ...prev, hoursReport, monthSummary: summary }
          : prev
      ));
      Logger.info(`🔄 MonthSummary refreshed for ${fullMonthKey}`);
    } catch (err) {
      Logger.warn('refreshMonthSummary error:', err?.message);
    }
  };

  // Carregar dados do mês atual — respeita cache
  const getCurrentMonthData = (forceReload = false) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    Logger.info(`📅 Carregando mês atual: ${month}/${year}`);
    loadMonthlyShifts(month, year, forceReload);
  };

  // Limpar dados
  const clearShiftsData = () => {
    setShiftsData({
      currentMonth: null,
      currentYear: null,
      monthlyCalendar: null,
      daysWithShifts: [],
      totalShifts: 0,
      hoursReport: null,
      loading: false,
      error: null,
      lastUpdated: null
    });
  };

  // Reset em troca de usuário: limpa state, in-memory cache e fetches pendentes,
  // e dispara auto-load para o novo usuário. Sem isso, monthsCache.current e
  // shiftsData vazam entre sessões (ex.: logout aurora → login webClient mostra
  // os plantões do usuário anterior).
  const prevUserIdRef = useRef(userId);
  const loadedForUserIdRef = useRef(null);
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      Logger.info(`🔄 userId mudou (${prevUserIdRef.current} → ${userId}), limpando estado`);
      monthsCache.current = {};
      inFlightRef.current = {};
      loadedForUserIdRef.current = null;
      setShiftsData({
        currentMonth: null,
        currentYear: null,
        monthlyCalendar: null,
        daysWithShifts: [],
        totalShifts: 0,
        loading: false,
        error: null,
        lastUpdated: null,
        loadedFor: null,
        monthSummary: null,
      });
      prevUserIdRef.current = userId;
    }

    // [WEBCLIENT-BRIDGE] `!user?.auroraOnlyMode` evita disparar getCurrentMonthData
    // (caminho PlantaoAPI) quando webClient migrou pra aurora-only.
    if (token && userId && !isAuroraOnly(user) && loadedForUserIdRef.current !== userId) {
      Logger.info('🔄 Token disponível, carregando dados do mês atual...');
      loadedForUserIdRef.current = userId;
      getCurrentMonthData();
    }
  }, [token, userId, user?.source, user?.auroraOnlyMode]);

  // [WEBCLIENT-BRIDGE] — auto-reload quando aurora-only liga/desliga, pra
  // garantir que o branch correto rode com os flags atualizados (botões de
  // Ceder/Trocar dependem de source='aurora' no shift, que só aparece após
  // o aurora-load gravar do Firestore na cache).
  const prevAuroraOnlyRef = useRef(!!user?.auroraOnlyMode);
  useEffect(() => {
    const wasOn = prevAuroraOnlyRef.current;
    const isOn = !!user?.auroraOnlyMode;
    prevAuroraOnlyRef.current = isOn;
    if (wasOn === isOn) return;
    if (!userId) return;
    const now = new Date();
    Logger.info(`🔄 auroraOnlyMode flipou (${wasOn} → ${isOn}), re-carregando mês atual`);
    loadMonthlyShifts(now.getMonth() + 1, now.getFullYear(), true).catch(() => {});
  }, [user?.auroraOnlyMode, userId]);

  const contextValue = {
    // Dados
    ...shiftsData,
    
    // Métodos
    loadMonthlyShifts,
    loadTwoMonthsData,
    refreshShifts,
    getCurrentMonthData,
    clearShiftsData,
    persistTimeEntries,
    refreshMonthSummary,
    
    // Estados derivados úteis
    isCurrentMonth: (month, year) => {
      const now = new Date();
      return month === (now.getMonth() + 1) && year === now.getFullYear();
    },
    
    hasDataFor: (month, year) => {
      return shiftsData.loadedFor === `${year}-${month}`;
    },

    getMonthCache: (month, year) => monthsCache.current[`${year}-${month}`],

    // Silent prefetch — warms monthsCache.current without touching setShiftsData.
    // Use this when loading months for display purposes (e.g. Charts) to avoid
    // clobbering the active month that Home/Calendar depend on.
    addManualShift: async (shiftData) => {
      if (!userId) return;
      const pad2 = n => String(n).padStart(2, '0');
      // Optional institution carries through to shift.group.institution so the
      // resolver in HospitalConfigResolver can route to per-hospital config.
      // null/undefined institution → manual shift falls back to global config.
      const inst = shiftData.institution || null;
      const groupId = inst?.id ? `manual_${inst.id}` : 'manual';
      const shift = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        date: shiftData.date,
        monthKey: shiftData.monthKey,
        label: shiftData.label,
        rawLabel: shiftData.label,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        durationMinutes: shiftData.durationMinutes,
        crossesMidnight: shiftData.crossesMidnight || false,
        carryover: false,
        splitHours: null,
        group: {
          id: groupId,
          name: shiftData.hospitalName,
          color: '#3FA9A7',
          institutionId: inst?.id || null,
          institutionName: inst?.name || shiftData.hospitalName,
          institution: inst ? { id: inst.id, name: inst.name } : null,
        },
        coworkerIds: [],
        syncedAt: new Date().toISOString(),
        isManual: true,
        // Plantão criado pelo médico nunca é escala fixa — só coord cria fixas
        // via aurora-web. Ver Glossário em models/index.js.
        isFixedSchedule: false,
        escalistaUserId: String(userId),
        currentHolderUserId: String(userId),
        time: `${shiftData.startTime} - ${shiftData.endTime} (${shiftData.label})`,
        originalData: null,
        // Ponto de partida do timeline. Append-only daqui pra frente; ver
        // src/utils/shiftTransferLog.js + memory project-shift-transferlog.
        transferLog: [makeLogEntry({
          type: TRANSFER_LOG_TYPES.CREATE,
          toUserId: userId,
          toUserName: user?.name || null,
          actorUserId: userId,
        })],
        cededAt: null,
      };
      await LocalCache.saveManualShift(userId, shift);

      // Write to Firestore
      try {
        const { db } = await import('../services/firebase/config');
        const { doc, setDoc, serverTimestamp } = await import('../services/firebase/fdb');
        if (db) await setDoc(doc(db, 'users', String(userId), 'manualShifts', shift.id), { ...shift, createdAt: serverTimestamp() });
      } catch (_) {}

      // Update state + cache + summary
      setShiftsData(prev => {
        const existing = prev.daysWithShifts || [];
        const dayIdx = existing.findIndex(d => d.date === shift.date);
        let updatedDays;
        if (dayIdx >= 0) {
          updatedDays = existing.map((d, i) =>
            i === dayIdx ? { ...d, shifts: [...d.shifts, shift], shiftsCount: d.shiftsCount + 1 } : d
          );
        } else {
          const d = new Date(shift.date + 'T00:00:00');
          const newDay = { day: d.getDate(), date: shift.date, shiftsCount: 1, shifts: [shift], originalData: null };
          updatedDays = [...existing, newDay].sort((a, b) => a.date.localeCompare(b.date));
        }
        const totalShifts = updatedDays.reduce((sum, d) => sum + (d.shifts?.length || 0), 0);
        const hoursReport = _patchHoursReport(prev.hoursReport, updatedDays);
        const memKey = `${prev.currentYear}-${prev.currentMonth}`;
        monthsCache.current[memKey] = { daysWithShifts: updatedDays, hoursReport, totalShifts };
        // Recompute summary async then push to state (past months: freeze bonus/loyalty)
        const fullMonthKey = `${prev.currentYear}-${String(prev.currentMonth).padStart(2, '0')}`;
        Promise.all([getFullShiftConfig(), LocalCache.getTimeEntries(userId, fullMonthKey)])
          .then(async ([liveCfg, te]) => {
            const cfg = await _resolveSummaryConfig(userId, fullMonthKey, liveCfg, updatedDays, isViewOnly(userRef.current));
            const s = computeMonthSummary(userId, fullMonthKey, updatedDays, te || {}, cfg);
            LocalCache.saveSummary(userId, fullMonthKey, s);
            setShiftsData(p => ({ ...p, monthSummary: s }));
          })
          .catch(() => {});
        return { ...prev, daysWithShifts: updatedDays, hoursReport, totalShifts };
      });
    },

    deleteManualShift: async (shiftId, monthKey) => {
      if (!userId) return;
      await LocalCache.deleteManualShift(userId, shiftId, monthKey);
      try {
        const { db } = await import('../services/firebase/config');
        const { doc, deleteDoc } = await import('../services/firebase/fdb');
        if (db) await deleteDoc(doc(db, 'users', userId, 'manualShifts', shiftId));
      } catch {}
      setShiftsData(prev => {
        const updated = (prev.daysWithShifts || []).map(d => ({
          ...d,
          shifts: d.shifts.filter(s => s.id !== shiftId),
          shiftsCount: d.shifts.filter(s => s.id !== shiftId).length,
        })).filter(d => d.shiftsCount > 0);
        const hoursReport = _patchHoursReport(prev.hoursReport, updated);
        return { ...prev, daysWithShifts: updated, hoursReport, totalShifts: Math.max(0, (prev.totalShifts || 0) - 1) };
      });
    },

    /**
     * Remove a shift from LocalCache (both buckets) + state + monthsCache.
     * Firestore deletion is performed by the caller (e.g. OffersContext) since
     * it already owns the cede semantics. This action only synchronizes the
     * local view so the calendar updates instantly after Ceder.
     */
    removeShiftLocally: async (shiftId, monthKey) => {
      if (!userId || !shiftId || !monthKey) return;
      await Promise.all([
        LocalCache.deleteManualShift(userId, shiftId, monthKey),
        LocalCache.deleteRegularShift(userId, shiftId, monthKey),
      ]);
      // Update monthsCache for every month that holds the shift (defensive)
      Object.entries(monthsCache.current).forEach(([k, cached]) => {
        const days = (cached?.daysWithShifts || []).map(d => ({
          ...d,
          shifts: (d.shifts || []).filter(s => String(s.id) !== String(shiftId)),
        })).filter(d => d.shifts.length > 0)
          .map(d => ({ ...d, shiftsCount: d.shifts.length }));
        // Recompute hoursReport — sem isso, total de horas fica congelado no
        // valor anterior à remoção (count cai, horas não).
        const hoursReport = _patchHoursReport(cached?.hoursReport, days);
        monthsCache.current[k] = {
          ...cached,
          daysWithShifts: days,
          hoursReport,
          totalShifts: days.reduce((n, d) => n + d.shifts.length, 0),
        };
      });
      setShiftsData(prev => {
        const updated = (prev.daysWithShifts || []).map(d => ({
          ...d,
          shifts: (d.shifts || []).filter(s => String(s.id) !== String(shiftId)),
        })).filter(d => d.shifts.length > 0)
          .map(d => ({ ...d, shiftsCount: d.shifts.length }));
        const hoursReport = _patchHoursReport(prev.hoursReport, updated);
        return {
          ...prev,
          daysWithShifts: updated,
          hoursReport,
          totalShifts: updated.reduce((n, d) => n + d.shifts.length, 0),
        };
      });
    },

    /**
     * Add a newly-claimed Aurora shift to the calendar instantly (used by
     * OpeningsScreen after a successful claim). Persists to LocalCache regular
     * bucket so it survives reloads on both aurora + webClient users.
     */
    addClaimedShiftLocally: async (shift) => {
      if (!userId || !shift?.id || !shift?.monthKey) return;
      await LocalCache.saveRegularShift(userId, shift);
      setShiftsData(prev => {
        const days = [...(prev.daysWithShifts || [])];
        const idx = days.findIndex(d => d.date === shift.date);
        if (idx >= 0) {
          if (!days[idx].shifts.some(s => String(s.id) === String(shift.id))) {
            days[idx] = { ...days[idx], shifts: [...days[idx].shifts, shift], shiftsCount: days[idx].shifts.length + 1 };
          }
        } else {
          const d = new Date((shift.date || '') + 'T00:00:00');
          days.push({ day: d.getDate(), date: shift.date, shifts: [shift], shiftsCount: 1, originalData: null });
          days.sort((a, b) => a.date.localeCompare(b.date));
        }
        const hoursReport = _patchHoursReport(prev.hoursReport, days);
        return { ...prev, daysWithShifts: days, hoursReport, totalShifts: (prev.totalShifts || 0) + 1 };
      });
    },

    /**
     * Re-insert a previously-removed shift snapshot (used by cede cancel).
     * Writes to the appropriate LocalCache bucket and patches state.
     */
    restoreShiftLocally: async (shift) => {
      if (!userId || !shift?.id || !shift?.monthKey) return;
      if (shift.isManual) {
        await LocalCache.saveManualShift(userId, shift);
      } else {
        await LocalCache.saveRegularShift(userId, shift);
      }
      setShiftsData(prev => {
        const days = [...(prev.daysWithShifts || [])];
        const idx = days.findIndex(d => d.date === shift.date);
        if (idx >= 0) {
          if (!days[idx].shifts.some(s => String(s.id) === String(shift.id))) {
            days[idx] = { ...days[idx], shifts: [...days[idx].shifts, shift], shiftsCount: days[idx].shifts.length + 1 };
          }
        } else {
          const d = new Date(shift.date + 'T00:00:00');
          days.push({ day: d.getDate(), date: shift.date, shifts: [shift], shiftsCount: 1, originalData: null });
          days.sort((a, b) => a.date.localeCompare(b.date));
        }
        return { ...prev, daysWithShifts: days, totalShifts: (prev.totalShifts || 0) + 1 };
      });
    },

    prefetchMonth: async (month, year) => {
      const monthKey = `${year}-${month}`;
      if (monthsCache.current[monthKey]) return; // already warm

      // Aurora não precisa de token webClient — só exige userId. O token só é
      // requerido no fallback webClient (não-aurora) mais abaixo.
      if (!userId) return;

      const fullMonthKey = `${year}-${String(month).padStart(2, '0')}`;

      // Try LocalCache first (no API cost)
      try {
        const persisted = await LocalCache.getShifts(userId, fullMonthKey);
        if (persisted) {
          const { daysWithShifts, hoursReport: rawReport, totalShifts } = persisted;
          const timeEntries = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
          const hoursReport = _buildHoursReport(daysWithShifts, timeEntries, rawReport);
          monthsCache.current[monthKey] = { daysWithShifts, hoursReport, totalShifts };
          return;
        }
      } catch (_) {}

      // Relatórios e Gráficos são analytics: leem SÓ o shadow (Firestore +
      // LocalCache), nunca webClient — pra qualquer source. Meses sem shadow
      // simplesmente aparecem vazios em vez de disparar requisição webClient.
      try {
        const remote = await FirebaseAdapter.fetchAuroraMonth(userId, fullMonthKey);
        if (remote.manualAuthoritative)  await LocalCache.setManualShifts(userId, fullMonthKey, remote.manualShifts);
        if (remote.regularAuthoritative) await LocalCache.saveRegularShifts(userId, fullMonthKey, remote.regularShifts);
      } catch (err) {
        Logger.warn(`[prefetchMonth] firestore hydration: ${err?.message}`);
      }
      const [manualShifts, regularShifts] = await Promise.all([
        LocalCache.getManualShifts(userId, fullMonthKey),
        LocalCache.getRegularShifts(userId, fullMonthKey),
      ]);
      const allShifts = [...manualShifts, ...regularShifts];
      const daysWithShifts = _manualShiftsToDaysWithShifts(allShifts);
      const timeEntries = (await LocalCache.getTimeEntries(userId, fullMonthKey).catch(() => ({}))) || {};
      const hoursReport = _buildHoursReport(daysWithShifts, timeEntries, null);
      monthsCache.current[monthKey] = {
        daysWithShifts,
        hoursReport,
        totalShifts: allShifts.length,
      };
    },
  };

  return (
    <ShiftsContext.Provider value={contextValue}>
      {children}
    </ShiftsContext.Provider>
  );
};

// Hook para usar o contexto
export const useShifts = () => {
  const context = useContext(ShiftsContext);
  if (!context) {
    throw new Error('useShifts deve ser usado dentro do ShiftsProvider');
  }
  return context;
};

export default ShiftsContext;
