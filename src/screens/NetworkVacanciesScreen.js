import { useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  RefreshControl, StyleSheet, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, BorderRadius, Shadows, Typography } from '../constants/DesignSystem';
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

const LABEL_UP = { M: 'MANHÃ', T: 'TARDE', N: 'NOITE', D: 'NOITE' };
const _labelColor = (C) => ({ M: C.money, T: C.warning, N: C.info, D: C.info });

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

export default function NetworkVacanciesScreen({ navigation }) {
  const C = useColors();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  // Open the group calendar for this vacancy's group on its day.
  const openGroupDay = useCallback((item) => {
    const [y, m, d] = item.date.split('-').map(Number);
    navigation?.navigate?.('GroupDayTeam', {
      date: new Date(y, m - 1, d),
      groupIds: [String(item.group.id)],
    });
  }, [navigation]);
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
  const [teamFilter, setTeamFilter] = useState(null); // group id or null = Tudo

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
                  // TODO(ceder): a PlantaoAPI não informa quem cedeu a vaga
                  // (dynamic_schedule.vacancy = { id, slots } apenas). Para exibir
                  // "Cedido por: X" é preciso mesclar as openings do Aurora
                  // (FirebaseAdapter / OpeningNormalizer.originUserName) por
                  // groupId+dateKey+label e popular este campo. Ver renderRow.
                  cededByName: null,
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

  // Vacancies on shifts where I'm already scheduled — "falta gente comigo".
  const withMe = useMemo(
    () => enriched.filter(it => it.mine && it.available > 0)
      .sort((a, b) => (a.startAt || 0) - (b.startAt || 0)),
    [enriched]
  );

  // Distinct teams (groups) present, in display order.
  const teams = useMemo(() => {
    const m = new Map();
    for (const it of enriched) {
      if (!m.has(it.group.id)) m.set(it.group.id, { ...it.group, count: 0 });
      m.get(it.group.id).count += it.available || 1;
    }
    return Array.from(m.values());
  }, [enriched]);

  const byTeam = useMemo(() => {
    const m = new Map();
    for (const it of enriched) {
      if (teamFilter && String(it.group.id) !== String(teamFilter)) continue;
      if (!m.has(it.group.id)) m.set(it.group.id, []);
      m.get(it.group.id).push(it);
    }
    for (const rows of m.values()) {
      rows.sort((a, b) =>
        a.date.localeCompare(b.date) || a.shiftLetter.localeCompare(b.shiftLetter)
      );
    }
    return m;
  }, [enriched, teamFilter]);

  const LABEL_C = _labelColor(C);

  const renderLabelChip = (letter) => {
    const c = LABEL_C[letter] || C.text.secondary;
    return (
      <View style={[s.labelChip, { backgroundColor: c + '1A' }]}>
        <Text style={[s.labelChipText, { color: c }]}>{LABEL_UP[letter] || 'PLANTÃO'}</Text>
      </View>
    );
  };

  const renderDayBlock = (item) => (
    <View style={s.dayBlock}>
      <Text style={s.dayBig}>{_dayNum(item.date)}</Text>
      <Text style={s.dayWk}>{_shortWeekday(item.date).toUpperCase()}</Text>
    </View>
  );

  const renderRow = (item) => (
    <Pressable key={item.key} style={s.row} onPress={() => openGroupDay(item)}>
      {renderDayBlock(item)}
      <View style={{ alignItems: 'flex-start' }}>
        <View style={s.rowTimeLine}>
          {renderLabelChip(item.shiftLetter)}
          <Text style={s.rowTime}>{item.timeRange}</Text>
        </View>
        {!!item.cededByName && (
          <Text style={s.cededBy} numberOfLines={1}>Cedido por: {item.cededByName}</Text>
        )}
      </View>
      <View style={{ flex: 1 }} />
      <View style={s.vacancyChip}>
        <Ionicons name="people-outline" size={12} color={C.primary} />
        <Text style={s.vacancyText}>{item.available} vaga{item.available !== 1 ? 's' : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.text.quaternary} />
    </Pressable>
  );

  const renderTeamFilter = () => {
    if (teams.length <= 1) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
        <Pressable
          onPress={() => setTeamFilter(null)}
          style={[s.fChip, !teamFilter && { backgroundColor: C.primary, borderColor: C.primary }]}
        >
          <Text style={[s.fChipText, { color: !teamFilter ? '#fff' : C.text.secondary }]}>Tudo</Text>
        </Pressable>
        {teams.map(t => {
          const active = String(teamFilter) === String(t.id);
          const gc = t.color || C.primary;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTeamFilter(active ? null : t.id)}
              style={[s.fChip, active && { borderColor: gc, backgroundColor: gc + '14' }]}
            >
              <View style={[s.fDot, { backgroundColor: gc }]} />
              <Text style={[s.fChipText, { color: active ? gc : C.text.secondary }]} numberOfLines={1}>{t.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

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
          <View style={s.toggle}>
            <Pressable onPress={() => setShowAll(false)} style={[s.toggleBtn, !showAll && { backgroundColor: C.primary }]}>
              <Text style={[s.toggleText, { color: !showAll ? '#fff' : C.text.secondary }]}>Meus grupos</Text>
            </Pressable>
            <Pressable onPress={() => setShowAll(true)} style={[s.toggleBtn, showAll && { backgroundColor: C.primary }]}>
              <Text style={[s.toggleText, { color: showAll ? '#fff' : C.text.secondary }]}>Todos os grupos</Text>
            </Pressable>
          </View>

          {enriched.length === 0 ? (
            <View style={[s.empty, { borderColor: C.border.light }]}>
              <Ionicons name="calendar-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
              <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhuma vaga nos próximos 7 dias</Text>
            </View>
          ) : (
            <>
              {withMe.length > 0 && (
                <>
                  <View style={s.sectionHead}>
                    <Ionicons name="sparkles-outline" size={13} color={C.warning} />
                    <Text style={s.sectionHeadWarn}>FALTA GENTE COM VOCÊ</Text>
                    <Text style={[s.sectionCount, { color: C.warning }]}>{withMe.length}</Text>
                  </View>
                  {withMe.map(item => {
                    const gc = item.group.color || C.primary;
                    return (
                      <Pressable key={`me-${item.key}`} style={s.meCard} onPress={() => openGroupDay(item)}>
                        <View style={s.meTop}>
                          {renderDayBlock(item)}
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={s.rowTimeLine}>
                              {renderLabelChip(item.shiftLetter)}
                              <Text style={s.rowTime}>{item.timeRange}</Text>
                            </View>
                            {!!item.cededByName && (
                              <Text style={s.cededBy} numberOfLines={1}>Cedido por: {item.cededByName}</Text>
                            )}
                            <View style={s.teamLine}>
                              <View style={[s.fDot, { backgroundColor: gc }]} />
                              <Text style={s.teamLineText} numberOfLines={1}>{item.group.name || item.group.institution?.name}</Text>
                            </View>
                          </View>
                          <Text style={s.meEscala}>você está{'\n'}escalada</Text>
                        </View>
                        <Text style={s.meFalta}>
                          Falta <Text style={s.meFaltaNum}>{item.available}</Text> colega{item.available !== 1 ? 's' : ''} no seu plantão.
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}

              {renderTeamFilter()}

              <View style={s.sectionHead}>
                <Text style={s.sectionHeadMuted}>POR EQUIPE</Text>
              </View>
              {Array.from(byTeam.entries()).map(([gid, rows]) => {
                const g = rows[0].group;
                const gc = g.color || C.primary;
                const total = rows.reduce((sum, r) => sum + (r.available || 1), 0);
                return (
                  <View key={gid} style={[s.teamCard, { borderColor: C.border.light }]}>
                    <View style={[s.teamCardHead, { borderLeftColor: gc }]}>
                      <View style={[s.fDot, { backgroundColor: gc }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.teamCardName} numberOfLines={1}>{g.name || g.institution?.name || '—'}</Text>
                        {!!g.institution?.name && g.institution.name !== g.name && (
                          <Text style={s.teamCardSub} numberOfLines={1}>{g.institution.name}</Text>
                        )}
                      </View>
                      <Text style={s.teamCardCount}>{total} vaga{total !== 1 ? 's' : ''}</Text>
                    </View>
                    {rows.map(renderRow)}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: BorderRadius.pill, borderWidth: 1 },
  retryText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Group scope toggle
  toggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    gap: 4,
    backgroundColor: C.background.elevated,
    borderWidth: 0.5,
    borderColor: C.border.light,
    marginBottom: Spacing.md,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999 },
  toggleText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Summary line
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.md, paddingHorizontal: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.text.tertiary },
  summaryValue: { fontSize: 18, fontFamily: Typography.fontFamily.bold, color: C.money },

  // Section headers
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  sectionHeadWarn: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.warning },
  sectionHeadMuted: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: C.text.tertiary },
  sectionCount: { fontSize: 11, fontWeight: '700' },

  // "Falta gente com você" card
  meCard: {
    backgroundColor: C.background.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.warning + '66',
    padding: 14,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  meTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meEscala: { fontSize: 10, fontWeight: '700', color: C.warning, textAlign: 'right', lineHeight: 13 },
  meFalta: { fontSize: 13, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  meFaltaNum: { fontFamily: Typography.fontFamily.bold, color: C.warning },

  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamLineText: { fontSize: 11.5, color: C.text.tertiary, flex: 1 },

  // Team filter chips
  chipsRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  fChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: C.border.light,
    backgroundColor: C.background.elevated,
  },
  fDot: { width: 8, height: 8, borderRadius: 4 },
  fChipText: { fontSize: 12.5, fontFamily: Typography.fontFamily.semiBold, maxWidth: 120 },

  // Team card
  teamCard: {
    backgroundColor: C.background.card,
    borderRadius: 16,
    borderWidth: 0.5,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.small,
  },
  teamCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border.light,
  },
  teamCardName: { fontSize: 14.5, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  teamCardSub: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  teamCardCount: { fontSize: 11, fontWeight: '600', color: C.text.tertiary },

  // Vacancy row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.border.light,
  },
  dayBlock: { width: 34, alignItems: 'center' },
  dayBig: { fontSize: 19, fontFamily: Typography.fontFamily.bold, color: C.text.primary, lineHeight: 21 },
  dayWk: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, color: C.text.tertiary },
  rowTimeLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTime: { fontSize: 12.5, fontWeight: '600', color: C.text.secondary },
  cededBy: { fontSize: 10.5, color: C.text.tertiary, marginTop: 3 },

  labelChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  labelChipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },

  vacancyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.primary + '14',
  },
  vacancyText: { fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold, color: C.primary },

  empty: { borderRadius: 16, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center', backgroundColor: C.background.card },
  emptyText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
});
