import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import ShiftBottomSheet from '../components/ShiftBottomSheet';
import TodayCoworkersService from '../services/TodayCoworkersService';
import { getGroupColors } from '../utils/GroupColorConfig';

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SkeletonBox = ({ width = '100%', height = 20, style }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#90a4ae', borderRadius: 6, opacity }, style]}
    />
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite' };

const HomeScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const { daysWithShifts, loading, loadMonthlyShifts } = useShifts();
  const [refreshing, setRefreshing] = useState(false);
  const [groupColors, setGroupColors] = useState({});
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    getGroupColors(userId).then(setGroupColors);
  }, [user?.id]);

  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    const now = new Date();
    await loadMonthlyShifts(now.getMonth() + 1, now.getFullYear(), true);
    setRefreshing(false);
  };

  useEffect(() => {
    const reload = () => {
      const now = new Date();
      loadMonthlyShifts(now.getMonth() + 1, now.getFullYear());
    };
    reload();
    const unsubscribe = navigation?.addListener?.('focus', reload);
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const allShifts = (daysWithShifts || []).flatMap(d => d.shifts || []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingShifts = allShifts
    .filter(s => new Date(s.date + 'T00:00:00') >= today)
    .slice(0, 5);

  const heroShift = upcomingShifts[0] || null;
  const listShifts = upcomingShifts.slice(1);

  const stats = {
    total: (daysWithShifts || []).reduce((sum, d) => sum + (d.shiftsCount || 0), 0),
    upcoming: upcomingShifts.length,
  };

  const openShiftBottomSheet = (shift) => {
    const dayData = (daysWithShifts || []).find(d => d.date === shift.date);
    setBsShifts(dayData?.shifts || [shift]);
    setBsDate(new Date(shift.date + 'T00:00:00'));
    setBsVisible(true);
  };

  const resolveGroupColor = (shift) => {
    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const shiftColor = (shift) => {
    const key = shift.label?.charAt(0);
    return key === 'M' ? C.success : key === 'N' ? C.warning : C.primary;
  };

  const shiftLabel = (shift) => LABEL_MAP[shift.label] || shift.label || 'Plantão';

  const formatShiftDate = (shift) => {
    const d = new Date(shift.date + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [h, m] = time.split(':');
    return `${h}h${m && m !== '00' ? m : ''}`;
  };

  // ── Hero Header ──────────────────────────────────────────────────────────────
  const renderHeader = () => {
    const firstName = user?.name?.split(' ')[0] || 'Usuário';
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
      <View style={[s.header, { paddingTop: Spacing.xl }]}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Text style={s.headerDate}>{dateStr}</Text>
            <Text style={s.headerGreeting}>{getGreeting()},</Text>
            <Text style={s.headerName}>{firstName}</Text>
          </View>
          <Pressable style={s.avatarRing} onPress={() => navigation?.navigate?.('profile')}>
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={s.avatarImg} />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: C.primary + '20' }]}>
                <Text style={s.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Stats pills */}
        <View style={s.statsRow}>
          <View style={s.statPill}>
            <Text style={s.statPillNumber}>{loading ? '—' : stats.total}</Text>
            <Text style={s.statPillLabel}>este mês</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statPill}>
            <Text style={s.statPillNumber}>{loading ? '—' : stats.upcoming}</Text>
            <Text style={s.statPillLabel}>próximos</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statPill}>
            <Text style={s.statPillNumber}>{loading ? '—' : Math.max(0, stats.total - stats.upcoming)}</Text>
            <Text style={s.statPillLabel}>realizados</Text>
          </View>
        </View>
      </View>
    );
  };

  // ── Hero Shift Card ──────────────────────────────────────────────────────────
  const renderHeroShift = () => {
    if (loading) {
      return (
        <View style={s.heroCard}>
          <SkeletonBox height={14} width="40%" style={{ marginBottom: 10 }} />
          <SkeletonBox height={22} width="60%" style={{ marginBottom: 8 }} />
          <SkeletonBox height={14} width="50%" />
        </View>
      );
    }

    if (!heroShift) {
      return (
        <View style={s.heroCardEmpty}>
          <Ionicons name="moon-outline" size={28} color={C.text.tertiary} />
          <Text style={s.heroEmptyTitle}>Sem plantões próximos</Text>
          <Text style={s.heroEmptyText}>Você está em paz por enquanto</Text>
        </View>
      );
    }

    const color = shiftColor(heroShift);
    const when = formatShiftDate(heroShift);
    const time = formatTime(heroShift.time);
    const groupColor = resolveGroupColor(heroShift);

    let coworkers = TodayCoworkersService.getCoworkers(heroShift.id);
    if (coworkers.length === 0 && heroShift?.originalData?.coworkers?.length > 0) {
      coworkers = heroShift.originalData.coworkers;
    }

    return (
      <Pressable style={[s.heroCard, { overflow: 'hidden' }]} onPress={() => openShiftBottomSheet(heroShift)}>
        <View style={[s.heroAccentBar, { backgroundColor: color }]} />
        <View style={s.heroCardInner}>
          <View style={s.heroTop}>
            <View style={[s.heroBadge, { backgroundColor: color + '18', borderColor: color + '35' }]}>
              <Text style={[s.heroBadgeText, { color }]}>{shiftLabel(heroShift)}</Text>
            </View>
            <Text style={s.heroWhen}>{when}</Text>
          </View>

          <Text style={[s.heroValue, { color }]}>
            {time ? `às ${time}` : 'Horário não definido'}
          </Text>

          <View style={s.heroMeta}>
            {heroShift.group?.name && (
              <View style={s.heroMetaRow}>
                <View style={[s.heroGroupDot, { backgroundColor: groupColor }]} />
                <Text style={[s.heroMetaText, { color: groupColor }]} numberOfLines={1}>
                  {heroShift.group.name}
                </Text>
              </View>
            )}
            {heroShift.group?.institution?.name && (
              <View style={s.heroMetaRow}>
                <Ionicons name="location-outline" size={13} color={C.text.tertiary} />
                <Text style={s.heroMetaText} numberOfLines={1}>
                  {heroShift.group.institution.name}
                </Text>
              </View>
            )}
            {coworkers.length > 0 && (
              <View style={s.heroMetaRow}>
                <Ionicons name="people-outline" size={13} color={C.text.tertiary} />
                <Text style={s.heroMetaText}>
                  {coworkers.length} colega{coworkers.length !== 1 ? 's' : ''} também
                </Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.text.tertiary} style={s.heroChevron} />
      </Pressable>
    );
  };

  // ── Shift List Row ────────────────────────────────────────────────────────────
  const renderShiftRow = (shift, index) => {
    const d = new Date(shift.date + 'T00:00:00');
    const color = shiftColor(shift);
    const groupColor = resolveGroupColor(shift);

    let coworkers = TodayCoworkersService.getCoworkers(shift.id);
    if (coworkers.length === 0 && shift?.originalData?.coworkers?.length > 0) {
      coworkers = shift.originalData.coworkers;
    }
    const vacancies = TodayCoworkersService.getVacanciesByGroup(shift.id);
    const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);

    return (
      <Pressable key={index} style={s.shiftRow} onPress={() => openShiftBottomSheet(shift)}>
        <View style={[s.shiftRowAccent, { backgroundColor: color }]} />

        <View style={s.shiftRowDate}>
          <Text style={[s.shiftRowDay, { color }]}>{d.getDate()}</Text>
          <Text style={s.shiftRowWday}>
            {d.toLocaleDateString('pt-BR', { weekday: 'short' })}
          </Text>
        </View>

        <View style={s.shiftRowInfo}>
          <Text style={s.shiftRowTitle}>Plantão {shiftLabel(shift)}</Text>
          <View style={s.shiftRowMeta}>
            {shift.group?.name && (
              <View style={[s.shiftRowGroupDot, { backgroundColor: groupColor }]} />
            )}
            {shift.group?.name && (
              <Text style={[s.shiftRowGroup, { color: groupColor }]} numberOfLines={1}>
                {shift.group.name}
              </Text>
            )}
            {(coworkers.length > 0 || totalVacancies > 0) && (
              <View style={s.coworkerDots}>
                {coworkers.slice(0, 3).map((p, i) => (
                  <View key={p.id} style={[s.coworkerDot, { marginLeft: i === 0 ? (shift.group?.name ? 6 : 0) : -5 }]}>
                    {p.photo
                      ? <Image source={{ uri: p.photo }} style={s.coworkerDotImg} />
                      : <View style={s.coworkerDotFallback}><Text style={s.coworkerDotInitial}>{(p.name || '?').charAt(0).toUpperCase()}</Text></View>
                    }
                  </View>
                ))}
                {coworkers.length > 3 && (
                  <View style={[s.coworkerDot, s.coworkerDotOverflow, { marginLeft: -5 }]}>
                    <Text style={s.coworkerDotOverflowText}>+{coworkers.length - 3}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        <Text style={s.shiftRowTime}>{formatTime(shift.time) || ''}</Text>
        <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
      </Pressable>
    );
  };

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  const renderActions = () => (
    <View style={s.actionsRow}>
      <Pressable style={s.actionBtn} onPress={() => navigation?.navigate?.('ChartsScreen')}>
        <View style={[s.actionIcon, { backgroundColor: C.primary + '15' }]}>
          <Ionicons name="bar-chart" size={22} color={C.primary} />
        </View>
        <Text style={s.actionLabel}>Gráficos</Text>
      </Pressable>
      <Pressable style={s.actionBtn} onPress={() => navigation?.navigate?.('Reports')}>
        <View style={[s.actionIcon, { backgroundColor: C.warning + '15' }]}>
          <Ionicons name="document-text" size={22} color={C.warning} />
        </View>
        <Text style={s.actionLabel}>Relatórios</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <ScrollView
        style={s.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {renderHeader()}

        <View style={s.body}>
          {/* Next shift */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>PRÓXIMO PLANTÃO</Text>
            {renderHeroShift()}
          </View>

          {/* More upcoming */}
          {(loading || listShifts.length > 0) && (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionLabel}>EM BREVE</Text>
                <Pressable onPress={() => navigation?.navigate?.('calendar')} style={s.seeAllBtn}>
                  <Text style={s.seeAllText}>Ver todos</Text>
                  <Ionicons name="chevron-forward" size={13} color={C.interactive.active} />
                </Pressable>
              </View>
              <View style={s.shiftList}>
                {loading
                  ? [0, 1].map(i => (
                      <View key={i} style={s.shiftRow}>
                        <View style={[s.shiftRowDate, { gap: 4 }]}>
                          <SkeletonBox width={24} height={22} />
                          <SkeletonBox width={20} height={10} />
                        </View>
                        <View style={s.shiftRowInfo}>
                          <SkeletonBox width="55%" height={13} style={{ marginBottom: 6 }} />
                          <SkeletonBox width="40%" height={11} />
                        </View>
                      </View>
                    ))
                  : listShifts.map((shift, i) => renderShiftRow(shift, i))
                }
              </View>
            </View>
          )}

          {/* Quick actions */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>FERRAMENTAS</Text>
            {renderActions()}
          </View>
        </View>
      </ScrollView>

      <ShiftBottomSheet
        isVisible={bsVisible}
        onClose={() => setBsVisible(false)}
        shifts={bsShifts}
        selectedDate={bsDate}
      />
    </>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.background.primary,
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border.light,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerLeft: { flex: 1 },
  headerDate: {
    fontSize: Typography.fontSize.caption1,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  headerGreeting: {
    fontSize: Typography.fontSize.subhead,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    marginBottom: 2,
  },
  headerName: {
    fontSize: 30,
    fontFamily: Typography.fontFamily.display,
    color: C.text.primary,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: C.primary + '60',
    overflow: 'hidden',
    marginLeft: Spacing.md,
    marginTop: 4,
  },
  avatarImg: { width: 48, height: 48 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: C.primary,
  },

  // ── Stats Pills ──────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.background.secondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
  },
  statPillNumber: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.display,
    color: C.primary,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  statPillLabel: {
    fontSize: Typography.fontSize.caption3,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: C.border.light,
  },

  // ── Body ─────────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.caption1,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: Typography.fontSize.caption1,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.interactive.active,
  },

  // ── Hero Shift Card ──────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.small,
  },
  heroAccentBar: {
    width: 4,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderBottomLeftRadius: BorderRadius.xl,
  },
  heroCardInner: {
    flex: 1,
    padding: Spacing.lg,
    paddingLeft: Spacing.lg + 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 8,
  },
  heroBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontSize: Typography.fontSize.caption1,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.2,
  },
  heroWhen: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  heroValue: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.display,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  heroMeta: {
    gap: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroGroupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  heroMetaText: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    flex: 1,
  },
  heroChevron: {
    marginRight: Spacing.md,
  },
  heroCardEmpty: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border.light,
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  heroEmptyTitle: {
    fontSize: Typography.fontSize.callout,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    marginTop: 4,
  },
  heroEmptyText: {
    fontSize: Typography.fontSize.subhead,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    textAlign: 'center',
  },

  // ── Shift List ───────────────────────────────────────────────────────────────
  shiftList: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.small,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.md + 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border.light,
    overflow: 'hidden',
    position: 'relative',
  },
  shiftRowAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  shiftRowDate: {
    alignItems: 'center',
    minWidth: 38,
    marginRight: 14,
    paddingRight: 14,
    borderRightWidth: 1,
    borderRightColor: C.border.light,
  },
  shiftRowDay: {
    fontSize: Typography.fontSize.title3,
    fontFamily: Typography.fontFamily.display,
    lineHeight: Typography.fontSize.title3 * 1.1,
    letterSpacing: -0.3,
  },
  shiftRowWday: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  shiftRowInfo: {
    flex: 1,
  },
  shiftRowTitle: {
    fontSize: Typography.fontSize.callout,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
    marginBottom: 3,
  },
  shiftRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftRowGroupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
    flexShrink: 0,
  },
  shiftRowGroup: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.regular,
    maxWidth: 120,
  },
  shiftRowTime: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    marginRight: Spacing.sm,
  },
  coworkerDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coworkerDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.background.primary,
    overflow: 'hidden',
  },
  coworkerDotImg: { width: 18, height: 18, borderRadius: 9 },
  coworkerDotFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerDotInitial: { fontSize: 8, fontFamily: Typography.fontFamily.bold, color: C.primary },
  coworkerDotOverflow: {
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerDotOverflowText: {
    fontSize: 7,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.secondary,
    textAlign: 'center',
  },

  // ── Quick Actions ─────────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: 8,
    ...Shadows.small,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: Typography.fontSize.footnote,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
  },
});

export default HomeScreen;
