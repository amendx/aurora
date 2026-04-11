import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import ShiftBottomSheet from '../components/ShiftBottomSheet';

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

const ShiftCardSkeleton = () => (
  <View style={styles.shiftCard}>
    <View style={styles.shiftDate}>
      <SkeletonBox width={32} height={28} style={{ marginBottom: 4 }} />
      <SkeletonBox width={24} height={12} />
    </View>
    <View style={styles.shiftInfo}>
      <SkeletonBox width="60%" height={14} style={{ marginBottom: 6 }} />
      <SkeletonBox width="40%" height={12} style={{ marginBottom: 4 }} />
      <SkeletonBox width="50%" height={11} />
    </View>
  </View>
);

const StatCardSkeleton = () => (
  <View style={[styles.statsCard, { alignItems: 'center', gap: 6 }]}>
    <SkeletonBox width={32} height={28} />
    <SkeletonBox width={48} height={12} />
  </View>
);
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_MAP = { M: 'Manhã', T: 'Tarde', N: 'Noite' };

const HomeScreenPremium = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const { daysWithShifts, loading, error, getCurrentMonthData, loadTwoMonthsData } = useShifts();
  const [refreshing, setRefreshing] = useState(false);

  // Bottom Sheet state
  const [bsVisible, setBsVisible] = useState(false);
  const [bsShifts, setBsShifts] = useState([]);
  const [bsDate, setBsDate] = useState(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Usar nova função que carrega 2 meses
    await loadTwoMonthsData(currentMonth, currentYear);
    setRefreshing(false);
  };

  // Carregar dados iniciais ao montar o componente
  useEffect(() => {
    const loadInitialData = async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Usar nova função para carregar com contexto completo
      await loadTwoMonthsData(currentMonth, currentYear);
    };
    
    loadInitialData();
  }, []);

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
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeContent}>
        <Text style={styles.greetingText}>{getGreeting()},</Text>
        <Text style={styles.userNameText}>{user?.name || 'Usuário'}</Text>
        <Text style={styles.welcomeSubtext}>
          {loading
            ? 'Carregando plantões...'
            : `Você tem ${upcomingShifts.length} plantões próximos`}
        </Text>
      </View>
      <View style={styles.welcomeIcon}>
        <Ionicons name="medical" size={32} color={Colors.primary} />
      </View>
    </View>
  );

  const renderStatsCards = () => (
    <View style={styles.statsContainer}>
      {loading ? (
        <>
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </>
      ) : (
        <>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.completed}</Text>
              <Text style={styles.statLabel}>Concluídos</Text>
            </View>
          </View>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.upcoming}</Text>
              <Text style={styles.statLabel}>Próximos</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const renderUpcomingShifts = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Próximos Plantões</Text>
        <Pressable style={styles.sectionAction} onPress={handleVerTodos}>
          <Text style={styles.sectionActionText}>Ver todos</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.interactive.active} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.shiftsContainer}>
          <ShiftCardSkeleton />
          <ShiftCardSkeleton />
        </View>
      ) : upcomingShifts.length > 0 ? (
        <View style={styles.shiftsContainer}>
          {upcomingShifts.map((shift, index) => {
            const shiftDate = new Date(shift.date + 'T00:00:00');
            const turno = LABEL_MAP[shift.label] || shift.label || '';
            return (
              <Pressable
                key={index}
                style={styles.shiftCard}
                onPress={() => openShiftBottomSheet(shift)}
              >
                <View style={styles.shiftDate}>
                  <Text style={styles.shiftDay}>{shiftDate.getDate()}</Text>
                  <Text style={styles.shiftWeekday}>
                    {shiftDate.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </Text>
                </View>

                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftTitle}>
                    {turno ? `Plantão ${turno}` : (shift.title || 'Plantão')}
                  </Text>
                  <Text style={styles.shiftTime}>
                    {shift.startTime || shift.start_time} – {shift.endTime || shift.end_time}
                  </Text>
                  {shift.group?.name && (
                    <Text style={styles.shiftGroup}>{shift.group.name}</Text>
                  )}
                
                </View>

                <View style={styles.shiftStatus}>
                  {/* <View style={[styles.statusIndicator, { backgroundColor: Colors.warning }]} /> */}
                  <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} style={{ marginTop: 4 }} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={Colors.interactive.inactive} />
          <Text style={styles.emptyStateText}>Nenhum plantão próximo</Text>
          <Text style={styles.emptyStateSubtext}>
            Seus próximos plantões aparecerão aqui
          </Text>
        </View>
      )}
    </View>
  );

  const renderQuickActions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ações Rápidas</Text>
      <View style={styles.actionsContainer}>
        <Pressable
          style={[styles.actionCard, styles.actionCardDisabled]}
          disabled
        >
          <View style={[styles.actionIcon, styles.actionIconDisabled]}>
            <Ionicons name="time" size={24} color={Colors.text.tertiary} />
          </View>
          <Text style={[styles.actionText, styles.actionTextDisabled]}>Registrar Horas</Text>
        </Pressable>

        <Pressable
          style={styles.actionCard}
          onPress={() => navigation?.navigate?.('Reports')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="document-text" size={24} color={Colors.warning} />
          </View>
          <Text style={styles.actionText}>Relatórios</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.content}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  content: {
    padding: Spacing.screen,
  },

  // Welcome Card
  welcomeCard: {
    backgroundColor: Colors.background.primary,
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
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  userNameText: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  welcomeSubtext: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.tertiary,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    backgroundColor: Colors.background.secondary,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats Cards
  statsContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statsCard: {
    flex: 1,
    backgroundColor: Colors.background.primary,
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
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Sections
  section: {
    marginBottom: Spacing.xl,
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
    color: Colors.text.primary,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionActionText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.interactive.active,
    marginRight: 4,
  },

  // Shifts
  shiftsContainer: {
    gap: Spacing.sm,
  },
  shiftCard: {
    backgroundColor: Colors.background.primary,
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
    color: Colors.primary,
    lineHeight: Typography.fontSize.title2 * 1.1,
  },
  shiftWeekday: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
  },
  shiftInfo: {
    flex: 1,
  },
  shiftTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  shiftTime: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  shiftGroup: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginBottom: 2,
  },
  shiftLocation: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.tertiary,
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
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xxl,
    alignItems: 'center',
    ...Shadows.small,
  },
  emptyStateText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.regular,
    color: Colors.text.secondary,
    textAlign: 'center',
  },

  // Quick Actions
  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.small,
  },
  actionIcon: {
    width: 48,
    height: 48,
    backgroundColor: Colors.background.secondary,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  actionCardDisabled: {
    opacity: 0.45,
  },
  actionIconDisabled: {
    backgroundColor: Colors.background.secondary,
  },
  actionTextDisabled: {
    color: Colors.text.tertiary,
  },
});

export default HomeScreenPremium;
