import { useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  RefreshControl, StyleSheet, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import WebClientApiService from '../services/WebClientApiService';
import LocalCache from '../services/LocalCache';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import {
  getFullShiftConfig,
  shouldUseWeekendValue,
  getShiftPeriod,
} from '../utils/ShiftValueCalculator';
import TimeUtils from '../utils/TimeUtils';
import Logger from '../utils/Logger';

const WINDOW_DAYS = 7;
const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const _nextDates = () => {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const _normalizeColor = (c) => {
  if (!c) return null;
  return String(c).startsWith('#') ? c : '#' + c;
};

const _shortWeekday = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return wd.charAt(0).toUpperCase() + wd.slice(1);
};

const _dayNum = (dateStr) => {
  const [, , d] = dateStr.split('-').map(Number);
  return d;
};

const _parseSlotTimes = (label) => {
  const parts = String(label || '').split(' - ');
  if (parts.length < 2) return null;
  const times = parts[1].split(' às ');
  if (times.length !== 2) return null;
  return { start: times[0].trim(), end: times[1].trim() };
};

const _slotStartDate = (dateStr, startTime) => {
  if (!dateStr || !startTime) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = startTime.replace('h', ':').split(':').map(Number);
  if ([y, m, d, h].some(Number.isNaN)) return null;
  return new Date(y, m - 1, d, h, min || 0, 0, 0);
};

const _fmtBRL = (value) => {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const _computeValue = (cfg, dateStr, shiftLetter, minutes) => {
  if (!cfg || !minutes) return 0;
  const useWeekend = shouldUseWeekendValue(dateStr, shiftLetter, cfg.fridayNightAsWeekend);
  const period = getShiftPeriod(shiftLetter);
  const bucket = useWeekend ? cfg.hourValues?.weekend : cfg.hourValues?.weekday;
  const hourly = parseFloat(bucket?.[period]) || (useWeekend ? (period === 'night' ? 185 : 170) : (period === 'night' ? 143 : 130));
  return Math.round((minutes / 60) * hourly * 100) / 100;
};

export default function NetworkVacanciesScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useContext(AuthContext);
  const selfId = user?.id || user?.data?.id || null;
  const { groups } = useGroups();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [visibility, setVisibility] = useState({ loaded: false, enabledIds: null });
  const [showAll, setShowAll] = useState(false);
  const [valueCfg, setValueCfg] = useState(null);

  useEffect(() => {
    getFullShiftConfig().then(setValueCfg).catch(() => setValueCfg(null));
  }, []);

  useEffect(() => {
    if (!selfId) { setVisibility({ loaded: true, enabledIds: null }); return; }
    let cancelled = false;
    getGroupVisibility(selfId).then(cfg => {
      if (cancelled) return;
      setVisibility({
        loaded: true,
        enabledIds: cfg?.enabledGroupIds ? cfg.enabledGroupIds.map(String) : null,
      });
    });
    return () => { cancelled = true; };
  }, [selfId]);

  const allGroups = useMemo(
    () => Object.values(groups || {}).filter(g => g?.id),
    [groups]
  );

  const groupList = useMemo(() => {
    if (!visibility.loaded) return [];
    if (showAll || !visibility.enabledIds) return allGroups;
    const set = new Set(visibility.enabledIds);
    return allGroups.filter(g => set.has(String(g.id)));
  }, [allGroups, visibility, showAll]);

  const groupKey = groupList.map(g => g.id).sort().join(',');

  const load = useCallback(async (force = false) => {
    if (!visibility.loaded) return;
    if (!token) { setItems([]); setLoading(false); return; }
    if (groupList.length === 0) { setItems([]); setLoading(false); return; }

    setError(null);

    try {
      const dates = _nextDates();
      const tasks = [];
      for (const g of groupList) {
        for (const date of dates) {
          tasks.push((async () => {
            const gid = String(g.id);
            let schedule = force ? null : await LocalCache.getGroupDaily(gid, date);
            if (!schedule) {
              const res = await WebClientApiService.getGroupDailyCalendar(token, gid, date);
              if (res.success && res.data?.dynamic_schedule) {
                schedule = res.data.dynamic_schedule;
                LocalCache.saveGroupDaily(gid, date, schedule).catch(() => {});
              }
            }
            if (!schedule) return [];
            return schedule
              .filter(s => (s?.vacancy?.slots ?? 0) > 0)
              .map(s => {
                const letter = String(s.label || '').charAt(0);
                const times = _parseSlotTimes(s.label);
                const minutes = times
                  ? (TimeUtils.calculateDurationMinutes(times.start, times.end) || 0)
                  : (letter === 'N' || letter === 'D' ? 720 : 360);
                const startAt = times ? _slotStartDate(date, times.start) : null;
                return {
                  key: `${gid}-${date}-${s.label}`,
                  date,
                  slotLabel: s.label,
                  shiftLetter: letter,
                  timeRange: times ? `${times.start} às ${times.end}` : s.label,
                  durationMin: minutes,
                  startAt: startAt ? startAt.getTime() : null,
                  available: s.vacancy.slots,
                  filled: s.shifts?.length ?? 0,
                  mine: !!(selfId && (s.shifts || []).some(x => String(x?.user?.id) === String(selfId))),
                  group: {
                    id: gid,
                    name: g.name || '',
                    color: _normalizeColor(g.color),
                    institution: g.institution || null,
                  },
                };
              });
          })());
        }
      }
      const results = await Promise.all(tasks);
      const flat = results.flat();
      flat.sort((a, b) =>
        a.date.localeCompare(b.date)
        || a.shiftLetter.localeCompare(b.shiftLetter)
        || (a.group.name || '').localeCompare(b.group.name || '')
      );
      setItems(flat);
    } catch (err) {
      Logger.error('[NetworkVacancies] load:', err?.message);
      setError(err?.message || 'Erro ao carregar vagas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, groupKey, selfId, visibility.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(false); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const now = Date.now();

  const enriched = useMemo(
    () => items.map(it => ({
      ...it,
      value: _computeValue(valueCfg, it.date, it.shiftLetter, it.durationMin),
      urgent: it.startAt != null && it.startAt - now < URGENT_THRESHOLD_MS && it.startAt >= now,
    })),
    [items, valueCfg, now]
  );

  const totalValue = useMemo(
    () => enriched.reduce((sum, it) => sum + (it.value || 0) * (it.available || 1), 0),
    [enriched]
  );

  const byDate = useMemo(() => {
    const m = {};
    for (const it of enriched) (m[it.date] = m[it.date] || []).push(it);
    return m;
  }, [enriched]);
  const dates = Object.keys(byDate);

  const renderToggle = () => (
    <View style={[s.toggle, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
      <Pressable
        onPress={() => setShowAll(false)}
        style={[s.toggleBtn, !showAll && { backgroundColor: C.primary }]}
      >
        <Text style={[s.toggleText, { color: !showAll ? '#fff' : C.text.secondary }]}>Meus grupos</Text>
      </Pressable>
      <Pressable
        onPress={() => setShowAll(true)}
        style={[s.toggleBtn, showAll && { backgroundColor: C.primary }]}
      >
        <Text style={[s.toggleText, { color: showAll ? '#fff' : C.text.secondary }]}>Todos os grupos</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {loading && !refreshing ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={C.text.tertiary} />
          <Text style={[s.errorText, { color: C.text.tertiary }]}>{error}</Text>
          <Pressable onPress={() => load(true)} style={[s.retryBtn, { borderColor: C.primary }]}>
            <Text style={[s.retryText, { color: C.primary }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          <View style={[s.summary, { backgroundColor: C.background.elevated, borderColor: C.border.light, ...Shadows.small }]}>
            <Text style={[s.summaryLabel, { color: C.text.tertiary }]}>Vagas disponíveis</Text>
            <Text style={[s.summaryValue, { color: C.text.primary }]}>
              até <Text style={{ color: C.money }}>{_fmtBRL(totalValue)}</Text>
            </Text>
          </View>

          {renderToggle()}
          <Text style={[s.caption, { color: C.text.tertiary }]}>
            {showAll
              ? 'Mostrando todos os seus grupos.'
              : 'Vagas dos grupos que você marcou como visíveis.'}
          </Text>

          {dates.length === 0 ? (
            <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
              <Ionicons name="calendar-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
              <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhuma vaga nos próximos 7 dias</Text>
            </View>
          ) : (
            dates.map(date => (
              <View key={date} style={{ marginBottom: Spacing.md }}>
                <View style={s.dayRow}>
                  <Text style={[s.dayLabel, { color: C.text.primary }]}>{_shortWeekday(date)}</Text>
                  <Text style={[s.dayNum, { color: C.text.tertiary }]}>{_dayNum(date)}</Text>
                </View>
                {byDate[date].map(item => {
                  const gc = item.group.color || C.primary;
                  return (
                    <View
                      key={item.key}
                      style={[card.wrap, { backgroundColor: C.background.elevated, borderColor: C.border.light, ...Shadows.small }]}
                    >
                      <View style={[card.strip, { backgroundColor: gc }]} />
                      <View style={card.body}>
                        <View style={card.headerRow}>
                          <View style={[card.labelBadge, { backgroundColor: gc + '22' }]}>
                            <Text style={[card.labelText, { color: gc }]}>{item.shiftLetter}</Text>
                          </View>
                          {item.mine ? (
                            <View style={[card.tagBadge, { backgroundColor: C.primary + '18' }]}>
                              <Ionicons name="person" size={10} color={C.primary} />
                              <Text style={[card.tagText, { color: C.primary }]}>meu plantão</Text>
                            </View>
                          ) : null}
                          {item.urgent ? (
                            <View style={[card.tagBadge, { backgroundColor: '#E0463222' }]}>
                              <Ionicons name="flame" size={10} color="#E04632" />
                              <Text style={[card.tagText, { color: '#E04632' }]}>urgente</Text>
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }} />
                          <Text style={[card.value, { color: C.money }]}>{_fmtBRL(item.value)}</Text>
                        </View>
                        <Text style={[card.institution, { color: C.text.primary }]} numberOfLines={1}>
                          {item.group.institution?.name || item.group.name || '—'}
                        </Text>
                        <Text style={[card.meta, { color: C.text.tertiary }]} numberOfLines={1}>
                          {item.timeRange} · {item.available} vaga{item.available !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const card = StyleSheet.create({
  wrap: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, flexDirection: 'row' },
  strip: { width: 4 },
  body: { flex: 1, padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  labelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  labelText: { fontSize: 12, fontWeight: '800' },
  tagBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  tagText: { fontSize: 10, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '800' },
  institution: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  meta: { fontSize: 12 },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: BorderRadius.pill, borderWidth: 1 },
  retryText: { fontSize: 13, fontWeight: '600' },
  summary: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.md, marginBottom: Spacing.md },
  summaryLabel: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  toggle: { flexDirection: 'row', borderRadius: BorderRadius.pill, borderWidth: 0.5, padding: 3, marginBottom: 6 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.pill },
  toggleText: { fontSize: 12, fontWeight: '700' },
  caption: { fontSize: 12, marginBottom: Spacing.md, paddingHorizontal: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: Spacing.sm },
  dayLabel: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  dayNum: { fontSize: 12, fontWeight: '600' },
  empty: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
});
