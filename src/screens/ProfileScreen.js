import React, { useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useContext(AuthContext);
  const { groups: rawGroups, loading, loadGroups } = useGroups();
  const [refreshing, setRefreshing] = React.useState(false);

  // Garantir que groups seja sempre um array
  const groups = Array.isArray(rawGroups) ? rawGroups : [];

  useEffect(() => {
    loadGroups();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadGroups();
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sair da Conta',
      'Tem certeza que deseja sair da sua conta?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const renderGroupItem = (group) => (
    <View key={group.id} style={styles.groupItem}>
      <View style={styles.groupItemIcon}>
        <View style={[styles.groupColorDot, { backgroundColor: group.color || Colors.primary }]} />
      </View>
      <View style={styles.groupItemContent}>
        <Text style={styles.groupName}>{group.name}</Text>
        {group.institution && (
          <Text style={styles.groupInstitution}>{group.institution.name}</Text>
        )}
        <View style={styles.groupStats}>
          <MaterialCommunityIcons name="account-group" size={14} color={Colors.text.secondary} />
          <Text style={styles.groupStatsText}>
            {(group.assists?.length || 0) + (group.analysts?.length || 0) + (group.observers?.length || 0) + 1} membros
          </Text>
          {group.is_personal && (
            <>
              <View style={styles.statDot} />
              <MaterialCommunityIcons name="account" size={14} color={Colors.accent} />
              <Text style={[styles.groupStatsText, { color: Colors.accent }]}>Pessoal</Text>
            </>
          )}
          {group.is_admin && (
            <>
              <View style={styles.statDot} />
              <MaterialCommunityIcons name="shield-crown" size={14} color={Colors.warning} />
              <Text style={[styles.groupStatsText, { color: Colors.warning }]}>Admin</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[Colors.primary]}
          tintColor={Colors.primary}
        />
      }
    >
      <View style={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.primary} />
            </View>
          </View>
          
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'email@exemplo.com'}</Text>
          </View>
        </View>

        {/* User Groups */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meus Grupos</Text>
            <Text style={styles.sectionCounter}>
              {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
            </Text>
          </View>
          
          <View style={styles.card}>
            {loading && groups.length === 0 ? (
              <View style={styles.loadingContainer}>
                <MaterialCommunityIcons name="loading" size={24} color={Colors.text.secondary} />
                <Text style={styles.loadingText}>Carregando grupos...</Text>
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="account-group-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>Nenhum grupo encontrado</Text>
                <Text style={styles.emptyDescription}>
                  Você ainda não faz parte de nenhum grupo ou plantão.
                </Text>
              </View>
            ) : (
              groups.map((group, index) => (
                <View key={group.id}>
                  {renderGroupItem(group)}
                  {index < groups.length - 1 && <View style={styles.separator} />}
                </View>
              ))
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [
                styles.actionItem,
                pressed && styles.actionItemPressed
              ]}
              onPress={() => navigation.navigate('GroupsScreen')}
            >
              <View style={styles.actionIcon}>
                <MaterialCommunityIcons name="account-group" size={24} color={Colors.primary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Ver Todos os Grupos</Text>
                <Text style={styles.actionSubtitle}>Visualizar detalhes e membros</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
            </Pressable>
            
            <View style={styles.separator} />
            
            <Pressable
              style={({ pressed }) => [
                styles.actionItem,
                styles.logoutItem,
                pressed && styles.actionItemPressed
              ]}
              onPress={handleLogout}
            >
              <View style={[styles.actionIcon, styles.logoutIcon]}>
                <Ionicons name="log-out-outline" size={24} color={Colors.error} />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, styles.logoutText]}>
                  Sair da Conta
                </Text>
                <Text style={styles.actionSubtitle}>
                  Desconectar do aplicativo
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>
            Cem Horas v1.0.0
          </Text>
        </View>
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
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl + 60,
  },

  // Profile Header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.small,
  },
  avatarContainer: {
    marginRight: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.background.secondary,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCounter: {
    fontSize: Typography.fontSize.caption1,
    color: Colors.text.tertiary,
  },
  card: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },

  // Group Items
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    minHeight: 68,
  },
  groupItemIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: 20,
    marginRight: Spacing.md,
  },
  groupColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  groupItemContent: {
    flex: 1,
  },
  groupName: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  groupInstitution: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupStatsText: {
    fontSize: Typography.fontSize.caption1,
    color: Colors.text.secondary,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.text.tertiary,
    marginHorizontal: 4,
  },

  // Action Items
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    minHeight: 60,
  },
  actionItemPressed: {
    backgroundColor: Colors.background.secondary,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.secondary,
    borderRadius: 20,
    marginRight: Spacing.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
    marginLeft: 56,
  },

  // Logout Item
  logoutIcon: {
    backgroundColor: Colors.error + '10',
  },
  logoutText: {
    color: Colors.error,
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    marginTop: Spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 18,
  },

  // App Info
  appInfo: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  appInfoText: {
    fontSize: Typography.fontSize.caption1,
    color: Colors.text.tertiary,
  },
});

export default ProfileScreen;