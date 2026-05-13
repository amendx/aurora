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

const ShiftCardSkeleton = () => {
  const C = useColors();
  const s = makeStyles(C);
  return (
    <View style={s.shiftCard}>
      <View style={s.shiftDate}>
        <SkeletonBox width={32} height={28} style={{ marginBottom: 4 }} />
        <SkeletonBox width={24} height={12} />
      </View>
      <View style={s.shiftInfo}>
        <SkeletonBox width="60%" height={14} style={{ marginBottom: 6 }} />
        <SkeletonBox width="40%" height={12} style={{ marginBottom: 4 }} />
        <SkeletonBox width="50%" height={11} />
      </View>
    </View>
  );
};

const StatCardSkeleton = () => {
  const C = useColors();
  const s = makeStyles(C);
  return (
    <View style={[s.statsCard, { alignItems: 'center', gap: 6 }]}>
      <SkeletonBox width={32} height={28} />
      <SkeletonBox width={48} height={12} />
    </View>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite' };

const HomeScreenPremium = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const { daysWithShifts, loading, error, loadMonthlyShifts } = useShifts();
  const [refreshing, setRefreshing] = useState(false);
  const [groupColors, setGroupColors] = useState({});
  const C = useColors();
  const s = makeStyles(C);

  // Load custom group colors (user overrides saved via GroupsScreen)
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    getGroupColors(userId).then(setGroupColors);
  }, [user?.id]);

  // Bottom Sheet state
  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    const now = new Date();
    await loadMonthlyShifts(now.getMonth() + 1, now.getFullYear(), true);
    setRefreshing(false);
  };

  // Reload current month on mount and every time this screen gains focus.
  // Uses navigation.addListener instead of useFocusEffect to avoid requiring
  // the component to be directly registered as a navigator screen.
  useEffect(() => {
    const reload = () => {
      const now = new Date();
      loadMonthlyShifts(now.getMonth() + 1, now.getFullYear());
    };
    reload(); // run on mount
    const unsubscribe = navigation?.addListener?.('focus', reload);
    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const allShifts = (daysWithShifts || []).flatMap(d => d.shifts || []);

  const getUpcomingShifts = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allShifts
      .filter(shift => new Date(shift.date + 'T00:00:00') >= today)
      .slice(0, 3);
  };

  const getMonthlyStats = () => {
    const total = (daysWithShifts || []).reduce((sum, d) => sum + (d.shiftsCount || 0), 0);
    return { total, completed: 0, upcoming: total };
  };

  const stats = getMonthlyStats();
  const upcomingShifts = getUpcomingShifts();

  const openShiftBottomSheet = (shift) => {
    // Find all shifts for the same day
    const dayData = (daysWithShifts || []).find(d => d.date === shift.date);
    setBsShifts(dayData?.shifts || [shift]);
    setBsDate(new Date(shift.date + 'T00:00:00'));
    setBsVisible(true);
  };

  const handleVerTodos = () => {
    if (navigation?.navigate) {
      navigation.navigate('calendar');
    }
  };

  const renderWelcomeCard = () => (
    <View style={s.welcomeCard}>
      <View style={s.welcomeContent}>
        <Text style={s.greetingText}>{getGreeting()},</Text>
        <Text style={s.userNameText}>{user?.name || 'Usuário'}</Text>
        <Text style={s.welcomeSubtext}>
          {loading
            ? 'Carregando plantões...'
            : `Você tem ${upcomingShifts.length} plantões próximos`}
        </Text>
      </View>
      <View style={s.welcomeIcon}>
        {user?.photo ? (
          <Image
            source={{ uri: user.photo }}
            style={s.avatarImage}
            accessibilityLabel="Foto do usuário"
          />
        ) : (
          <Ionicons name="person-circle" size={32} color={C.primary} />
        )}
      </View>
    </View>
  );

  const renderStatsCards = () => (
    <View style={s.statsContainer}>
      {loading ? (
        <>
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </>
      ) : (
        <>
          <View style={s.statsCard}>
            <View style={s.statItem}>
              <Text style={s.statNumber}>{stats.total}</Text>
              <Text style={s.statLabel}>Total</Text>
            </View>
          </View>
          <View style={s.statsCard}>
            <View style={s.statItem}>
              <Text style={s.statNumber}>{stats.completed}</Text>
              <Text style={s.statLabel}>Concluídos</Text>
            </View>
          </View>
          <View style={s.statsCard}>
            <View style={s.statItem}>
              <Text style={s.statNumber}>{stats.upcoming}</Text>
              <Text style={s.statLabel}>Próximos</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const renderUpcomingShifts = () => (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Próximos Plantões</Text>
        <Pressable style={s.sectionAction} onPress={handleVerTodos}>
          <Text style={s.sectionActionText}>Ver todos</Text>
          <Ionicons name="chevron-forward" size={16} color={C.interactive.active} />
        </Pressable>
      </View>

      {loading ? (
        <View style={s.shiftsContainer}>
          <ShiftCardSkeleton />
          <ShiftCardSkeleton />
        </View>
      ) : upcomingShifts.length > 0 ? (
        <View style={s.shiftsContainer}>
          {upcomingShifts.map((shift, index) => {
            const shiftDate = new Date(shift.date + 'T00:00:00');
            const turno = LABEL_MAP[shift.label] || shift.label || '';
            return (
              <Pressable
                key={index}
                style={s.shiftCard}
                onPress={() => openShiftBottomSheet(shift)}
              >
                <View style={s.shiftDate}>
                  <Text style={s.shiftDay}>{shiftDate.getDate()}</Text>
                  <Text style={s.shiftWeekday}>
                    {shiftDate.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </Text>
                </View>

                <View style={s.shiftInfo}>
                  <Text style={s.shiftTitle}>
                    {turno ? `Plantão ${turno}` : (shift.title || 'Plantão')}
                  </Text>
                  {(() => {
                    // Primary: cross-group cache from TodayCoworkersService
                    // Fallback: originalData.coworkers[] (own group only, already excludes self)
                    let coworkers = TodayCoworkersService.getCoworkers(shift.id);
                    if (coworkers.length === 0 && shift?.originalData?.coworkers?.length > 0) {
                      coworkers = shift.originalData.coworkers;
                    }
                    const vacancies = TodayCoworkersService.getVacanciesByGroup(shift.id);
                    const totalVacancies = vacancies.reduce((acc, v) => acc + (v.available ?? 0), 0);
                    if (coworkers.length === 0 && totalVacancies === 0) return null;
                    const visible = coworkers.slice(0, 4);
                    const overflow = coworkers.length - visible.length;
                    return (
                      <View style={s.coworkerDots}>
                        {visible.map((p, i) => (
                          <View
                            key={p.id}
                            style={[s.coworkerDot, { marginLeft: i === 0 ? 0 : -6 }]}
                          >
                            {p.photo ? (
                              <Image source={{ uri: p.photo }} style={s.coworkerDotImg} />
                            ) : (
                              <View style={s.coworkerDotFallback}>
                                <Text style={s.coworkerDotInitial}>
                                  {(p.name || '?').charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                        {overflow > 0 && (
                          <View style={[s.coworkerDot, s.coworkerDotOverflow, { marginLeft: -6 }]}>
                            <Text style={s.coworkerDotOverflowText}>+{overflow}</Text>
                          </View>
                        )}
                        {totalVacancies > 0 && (
                          <View style={[s.vacancyDot, { marginLeft: coworkers.length > 0 ? 4 : 0 }]}>
                            <Ionicons name="star-outline" size={9} color={C.warning} />
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {shift.group?.name && (() => {
                    const raw = groupColors[String(shift.group?.id)] || shift.group?.color;
                    const groupColor = raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
                    return (
                      <View style={s.shiftGroupRow}>
                        <View style={[s.shiftGroupDot, { backgroundColor: groupColor }]} />
                        <Text style={[s.shiftGroup, { color: groupColor }]} numberOfLines={1}>
                          {shift.group.name}
                        </Text>
                      </View>
                    );
                  })()}

                </View>

                <View style={s.shiftStatus}>
                  {/* <View style={[s.statusIndicator, { backgroundColor: C.warning }]} /> */}
                  <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} style={{ marginTop: 4 }} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={s.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={C.interactive.inactive} />
          <Text style={s.emptyStateText}>Nenhum plantão próximo</Text>
          <Text style={s.emptyStateSubtext}>
            Seus próximos plantões aparecerão aqui
          </Text>
        </View>
      )}
    </View>
  );

  const renderQuickActions = () => (
    <View style={s.section}>
       <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>Relatórios</Text>
       </View>
      <View style={s.actionsContainer}>
        <Pressable
          style={[s.actionCard, s.actionCardDisabled]}
          disabled
        >
          <View style={[s.actionIcon, s.actionIconDisabled]}>
            <Ionicons name="time" size={24} color={C.text.tertiary} />
          </View>
          <Text style={[s.actionText, s.actionTextDisabled]}>Registrar Horas</Text>
        </Pressable>

        <Pressable
          style={s.actionCard}
          onPress={() => navigation?.navigate?.('Reports')}
        >
          <View style={s.actionIcon}>
            <Ionicons name="document-text" size={24} color={C.warning} />
          </View>
          <Text style={s.actionText}>Relatórios</Text>
        </Pressable>
      </View>
     
    </View>
  );

  return (
    <>
      <ScrollView
        style={s.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={s.content}>
          {renderWelcomeCard()}
          {renderStatsCards()}
          {renderUpcomingShifts()}
          {renderQuickActions()}
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
  content: {
    padding: Spacing.screen,
  },

  // Welcome Card
  welcomeCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.small,
  },
  welcomeContent: {
    flex: 1,
  },
  greetingText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.regular,
    color: C.text.secondary,
    marginBottom: 4,
  },
  userNameText: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: C.text.primary,
    marginBottom: Spacing.sm,
  },
  welcomeSubtext: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: C.text.tertiary,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    backgroundColor: C.background.secondary,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    resizeMode: 'cover',
  },

  // Stats Cards
  statsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statsCard: {
    flex: 1,
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.small,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: Typography.fontSize.title1,
    fontWeight: Typography.fontWeight.bold,
    color: C.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: Typography.fontSize.caption3,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Sections
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionActionText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.interactive.active,
    marginRight: 4,
  },

  // Shifts
  shiftsContainer: {
    gap: Spacing.sm,
  },
  shiftCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.small,
  },
  shiftDate: {
    alignItems: 'center',
    marginRight: Spacing.md,
    minWidth: 50,
  },
  shiftDay: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: C.primary,
    lineHeight: Typography.fontSize.title2 * 1.1,
  },
  shiftWeekday: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
    textTransform: 'uppercase',
  },
  shiftInfo: {
    flex: 1,
  },
  shiftTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: 2,
  },
  shiftTime: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: C.text.secondary,
    marginBottom: 2,
  },
  shiftGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  shiftGroupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  shiftGroup: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: C.primary,
    flex: 1,
  },
  coworkerDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    marginTop: 1,
  },
  coworkerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.background.primary,
    overflow: 'hidden',
  },
  coworkerDotImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  coworkerDotFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coworkerDotInitial: {
    fontSize: 9,
    fontWeight: '700',
    color: C.primary,
  },
 coworkerDotOverflow: {
  backgroundColor: C.border.medium,
  alignItems: 'center',
  justifyContent: 'center',
},

coworkerDotOverflowText: {
  fontSize: 8,
  fontWeight: '700',
  color: C.text.secondary,
  textAlign: 'center',
  includeFontPadding: false,
},
  vacancyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.warning + '20',
    borderWidth: 1,
    borderColor: C.warning + '50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftLocation: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.regular,
    color: C.text.tertiary,
  },
  shiftStatus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Empty State
  emptyState: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xxl,
    alignItems: 'center',
    ...Shadows.small,
  },
  emptyStateText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: C.text.secondary,
    textAlign: 'center',
  },

  // Quick Actions
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.small,
  },
  actionIcon: {
    width: 48,
    height: 48,
    backgroundColor: C.background.secondary,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
    textAlign: 'center',
  },
  actionCardDisabled: {
    opacity: 0.45,
  },
  actionIconDisabled: {
    backgroundColor: C.background.secondary,
  },
  actionTextDisabled: {
    color: C.text.tertiary,
  },
});

export default HomeScreenPremium;
