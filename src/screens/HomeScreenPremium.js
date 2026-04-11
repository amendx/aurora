import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const HomeScreenPremium = () => {
  const { user } = useContext(AuthContext);
  const { daysWithShifts, loading, error, getCurrentMonthData } = useShifts();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    getCurrentMonthData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Achata todos os turnos de daysWithShifts em uma lista plana
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

  const renderWelcomeCard = () => (
    <View style={styles.welcomeCard}>
      <View style={styles.welcomeContent}>
        <Text style={styles.greetingText}>{getGreeting()},</Text>
        <Text style={styles.userNameText}>{user?.name || 'Usuário'}</Text>
        <Text style={styles.welcomeSubtext}>
          Você tem {upcomingShifts.length} plantões próximos
        </Text>
      </View>
      <View style={styles.welcomeIcon}>
        <Ionicons name="medical" size={32} color={Colors.primary} />
      </View>
    </View>
  );

  const renderStatsCards = () => (
    <View style={styles.statsContainer}>
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
    </View>
  );

  const renderUpcomingShifts = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Próximos Plantões</Text>
        <Pressable style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>Ver todos</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.interactive.active} />
        </Pressable>
      </View>

      {upcomingShifts.length > 0 ? (
        <View style={styles.shiftsContainer}>
          {upcomingShifts.map((shift, index) => (
            <Pressable key={index} style={styles.shiftCard}>
              <View style={styles.shiftDate}>
                <Text style={styles.shiftDay}>
                  {new Date(shift.date).getDate()}
                </Text>
                <Text style={styles.shiftMonth}>
                  {new Date(shift.date).toLocaleDateString('pt-BR', { month: 'short' })}
                </Text>
              </View>
              
              <View style={styles.shiftInfo}>
                <Text style={styles.shiftTitle}>{shift.title || 'Plantão'}</Text>
                <Text style={styles.shiftTime}>
                  {shift.startTime} - {shift.endTime}
                </Text>
                <Text style={styles.shiftLocation}>
                  {shift.location || 'Local não informado'}
                </Text>
              </View>

              <View style={styles.shiftStatus}>
                <View style={[styles.statusIndicator, { backgroundColor: Colors.warning }]} />
              </View>
            </Pressable>
          ))}
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
        <Pressable style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="add" size={24} color={Colors.primary} />
          </View>
          <Text style={styles.actionText}>Novo Plantão</Text>
        </Pressable>

        <Pressable style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="time" size={24} color={Colors.success} />
          </View>
          <Text style={styles.actionText}>Registrar Horas</Text>
        </Pressable>

        <Pressable style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="document-text" size={24} color={Colors.warning} />
          </View>
          <Text style={styles.actionText}>Relatório</Text>
        </Pressable>

        <Pressable style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="settings" size={24} color={Colors.interactive.inactive} />
          </View>
          <Text style={styles.actionText}>Configurar</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
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
  shiftMonth: {
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
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  actionCard: {
    flex: 1,
    minWidth: '45%',
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
});

export default HomeScreenPremium;