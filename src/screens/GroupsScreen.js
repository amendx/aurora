import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroups } from '../contexts/GroupsContext';
import { AuthContext } from '../context/AuthContext';
import SoffiaApiService from '../services/SoffiaApiService';
import Logger from '../utils/Logger';

const { width } = Dimensions.get('window');
const COLORS = {
  gradient: ['#667eea', '#764ba2'],
  background: '#f8fafc',
  card: '#ffffff',
  cardShadow: 'rgba(0, 0, 0, 0.08)',
  text: '#1e293b',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  border: '#e2e8f0',
  white: '#ffffff',
};

const MemberCard = ({ member, type }) => {
  const getTypeIcon = () => {
    switch (type) {
      case 'manager':
        return { name: 'crown', color: COLORS.warning };
      case 'assist':
        return { name: 'account-star', color: COLORS.accent };
      case 'analyst':
        return { name: 'account-check', color: COLORS.success };
      case 'observer':
        return { name: 'account-eye', color: COLORS.textSecondary };
      default:
        return { name: 'account', color: COLORS.textSecondary };
    }
  };

  const typeIcon = getTypeIcon();
  const typeLabel = {
    manager: 'Gerente',
    assist: 'Assistente',
    analyst: 'Analista',
    observer: 'Observador',
  }[type] || 'Membro';

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberAvatar}>
        <MaterialCommunityIcons name="account-circle" size={40} color={COLORS.textLight} />
        <View style={[styles.typeIndicator, { backgroundColor: typeIcon.color }]}>
          <MaterialCommunityIcons name={typeIcon.name} size={12} color={COLORS.white} />
        </View>
      </View>
      
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name || member.full_name}</Text>
        <Text style={styles.memberRole}>{member.role}</Text>
        {member.council && (
          <Text style={styles.memberCouncil}>{member.council}</Text>
        )}
        <Text style={[styles.memberType, { color: typeIcon.color }]}>{typeLabel}</Text>
      </View>
      
      <View style={styles.memberActions}>
        {member.phone && (
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="call" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
        {member.email && (
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="mail" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const GroupCard = ({ group, initialExpanded = false, memberFilter = '' }) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [fullMembers, setFullMembers] = useState(null); // null = não carregado
  const [loadingMembers, setLoadingMembers] = useState(false);
  const { token } = useContext(AuthContext);

  // Membros parciais do /groups (pode estar truncado)
  const partialMembers = [
    ...(group.manager ? [{ ...group.manager, type: 'manager' }] : []),
    ...(group.assists || []).map(m => ({ ...m, type: 'assist' })),
    ...(group.analysts || []).map(m => ({ ...m, type: 'analyst' })),
    ...(group.observers || []).map(m => ({ ...m, type: 'observer' })),
  ];

  // Usar total_users da API se disponível, senão contar parciais
  const totalMembers = group.total_users || partialMembers.length;

  // Membros a exibir: fullMembers se já carregado, senão parciais
  const displayMembers = fullMembers || partialMembers;

  // Filtrar membros por nome
  const filteredMembers = memberFilter.trim()
    ? displayMembers.filter(m => {
        const name = (m.name || m.full_name || '').toLowerCase();
        return name.includes(memberFilter.trim().toLowerCase());
      })
    : displayMembers;

  // Buscar detalhes completos do grupo ao expandir
  const fetchFullGroupDetails = async () => {
    if (fullMembers || !token || SoffiaApiService.isMockToken(token)) return;
    
    setLoadingMembers(true);
    try {
      const response = await SoffiaApiService.getGroupById(token, group.id);
      if (response.success && response.data) {
        const fullData = response.data;
        const members = [
          ...(fullData.manager ? [{ ...fullData.manager, type: 'manager' }] : []),
          ...(fullData.assists || []).map(m => ({ ...m, type: 'assist' })),
          ...(fullData.analysts || []).map(m => ({ ...m, type: 'analyst' })),
          ...(fullData.observers || []).map(m => ({ ...m, type: 'observer' })),
        ];
        setFullMembers(members);
        Logger.info(`👥 Grupo ${group.name}: ${members.length} membros carregados via /groups/${group.id}`);
      }
    } catch (error) {
      Logger.error(`Erro ao buscar detalhes do grupo ${group.id}:`, error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleToggleExpand = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      fetchFullGroupDetails();
    }
  };

  // Auto-expandir se initialExpanded
  useEffect(() => {
    if (initialExpanded) {
      fetchFullGroupDetails();
    }
  }, [initialExpanded]);

  return (
    <View style={styles.groupCard}>
      <TouchableOpacity
        style={styles.groupHeader}
        onPress={handleToggleExpand}
      >
        <View style={styles.groupInfo}>
          <View style={styles.groupTitleRow}>
            <View style={[styles.groupColorDot, { backgroundColor: group.color || COLORS.accent }]} />
            <Text style={styles.groupName}>{group.name}</Text>
            {group.is_personal && (
              <View style={styles.personalBadge}>
                <Text style={styles.personalBadgeText}>Pessoal</Text>
              </View>
            )}
          </View>
          
          {group.institution && (
            <Text style={styles.groupInstitution}>{group.institution.name}</Text>
          )}
          
          <View style={styles.groupStats}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="account-group" size={16} color={COLORS.textSecondary} />
              <Text style={styles.statText}>{totalMembers} membros</Text>
            </View>
            
            {group.unread_notices > 0 && (
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="bell" size={16} color={COLORS.warning} />
                <Text style={[styles.statText, { color: COLORS.warning }]}>
                  {group.unread_notices} avisos
                </Text>
              </View>
            )}
            
            {group.is_admin && (
              <View style={styles.adminBadge}>
                <MaterialCommunityIcons name="shield-crown" size={14} color={COLORS.warning} />
                <Text style={[styles.statText, { color: COLORS.warning }]}>Admin</Text>
              </View>
            )}
          </View>
        </View>
        
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>
      
      {expanded && (
        <View style={styles.groupMembers}>
          {loadingMembers ? (
            <View style={styles.membersLoadingContainer}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.membersLoadingText}>Carregando membros...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.membersTitle}>
                {memberFilter.trim()
                  ? `${filteredMembers.length} de ${displayMembers.length} membros`
                  : `Membros (${displayMembers.length})`
                }
              </Text>
              {filteredMembers.length === 0 ? (
                <Text style={styles.noMembersText}>Nenhum membro encontrado para "{memberFilter}"</Text>
              ) : (
                filteredMembers.map((member, index) => (
                  <MemberCard key={`${member.id}-${index}`} member={member} type={member.type} />
                ))
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
};

const GroupsScreen = ({ navigation, focusGroupId = null }) => {
  const { groups: rawGroups, loading, error, loadGroups } = useGroups();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('todos'); // 'todos' | 'meus'
  const [memberFilter, setMemberFilter] = useState('');
  const scrollViewRef = useRef(null);

  const groups = Array.isArray(rawGroups) ? rawGroups : [];

  // "Meus Grupos" = onde sou admin ou gestor pessoal
  const meusGrupos = groups.filter(g => g.is_admin || g.is_personal);
  // "Todos os Grupos" = todos que pertenço (a API já filtra pelos do usuário)
  const todosGrupos = groups;

  const displayedGroups = activeTab === 'meus' ? meusGrupos : todosGrupos;

  // Se tiver focusGroupId, muda para a aba que contém o grupo
  useEffect(() => {
    if (focusGroupId && groups.length > 0) {
      const isInMeus = meusGrupos.some(g => g.id === focusGroupId);
      if (isInMeus) {
        setActiveTab('meus');
      } else {
        setActiveTab('todos');
      }
    }
  }, [focusGroupId, groups.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadGroups();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível atualizar os grupos');
    } finally {
      setRefreshing(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerGradient}>
        <SafeAreaView>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            
            <Text style={styles.headerTitle}>Grupos</Text>
            
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={loading || refreshing}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={COLORS.white}
                style={refreshing ? { opacity: 0.6 } : {}}
              />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'todos' && styles.tabActive]}
        onPress={() => setActiveTab('todos')}
      >
        <Text style={[styles.tabText, activeTab === 'todos' && styles.tabTextActive]}>
          Todos os Grupos
        </Text>
        <View style={[styles.tabBadge, activeTab === 'todos' && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, activeTab === 'todos' && styles.tabBadgeTextActive]}>
            {todosGrupos.length}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'meus' && styles.tabActive]}
        onPress={() => setActiveTab('meus')}
      >
        <Text style={[styles.tabText, activeTab === 'meus' && styles.tabTextActive]}>
          Meus Grupos
        </Text>
        <View style={[styles.tabBadge, activeTab === 'meus' && styles.tabBadgeActive]}>
          <Text style={[styles.tabBadgeText, activeTab === 'meus' && styles.tabBadgeTextActive]}>
            {meusGrupos.length}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    if (loading && groups.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Carregando grupos...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>Erro ao carregar grupos</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadGroups}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (groups.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>Nenhum grupo encontrado</Text>
          <Text style={styles.emptyMessage}>
            Você ainda não faz parte de nenhum grupo ou plantão.
          </Text>
        </View>
      );
    }

    const emptyTabMessage = activeTab === 'meus'
      ? 'Você não é administrador de nenhum grupo.'
      : 'Nenhum grupo encontrado.';

    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.accent]}
            tintColor={COLORS.accent}
          />
        }
      >
        {renderTabs()}

        {/* Busca/filtro de membros */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={18} color={COLORS.textLight} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar membro por nome..."
              placeholderTextColor={COLORS.textLight}
              value={memberFilter}
              onChangeText={setMemberFilter}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {memberFilter.length > 0 && (
              <TouchableOpacity onPress={() => setMemberFilter('')} style={styles.clearSearchButton}>
                <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {displayedGroups.length === 0 ? (
          <View style={styles.emptyTabContainer}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyTabText}>{emptyTabMessage}</Text>
          </View>
        ) : (
          <View style={styles.groupsList}>
            {displayedGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                initialExpanded={focusGroupId === group.id}
                memberFilter={memberFilter}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.gradient[0]} />
      {renderHeader()}
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  headerGradient: {
    backgroundColor: COLORS.gradient[0], // Usar a primeira cor do gradiente como cor sólida
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 15,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  groupsList: {
    paddingHorizontal: 20,
  },
  groupCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  groupInfo: {
    flex: 1,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  personalBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  personalBadgeText: {
    fontSize: 10,
    color: COLORS.white,
    fontWeight: '500',
  },
  groupInstitution: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginLeft: 24,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: 24,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupMembers: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  membersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  memberAvatar: {
    position: 'relative',
    marginRight: 12,
  },
  typeIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  memberRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  memberCouncil: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 1,
  },
  memberType: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 20,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  bottomSpacing: {
    height: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabBadgeTextActive: {
    color: COLORS.white,
  },
  emptyTabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 40,
  },
  emptyTabText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 4,
  },
  clearSearchButton: {
    padding: 4,
  },
  membersLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  membersLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  noMembersText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 12,
    fontStyle: 'italic',
  },
});

export default GroupsScreen;