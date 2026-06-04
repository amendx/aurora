import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroups } from '../contexts/GroupsContext';
import { AuthContext } from '../context/AuthContext';
import Logger from '../utils/Logger';
import { COLOR_PALETTE, getGroupColors, saveGroupColor } from '../utils/GroupColorConfig';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const { width } = Dimensions.get('window');

// Coerções defensivas — aceita string ou objeto e devolve string vazia/válida.
// Usado pra renderizar campos vindos do model NormalizedUser (council = {id,state})
// ou do webClient (council = string) sem quebrar React.
const _str = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return ''; // qualquer objeto/array — quem chama trata via campo específico
};
const _councilStr = (c) => {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'object') {
    const parts = [c.crm, c.id, c.state].filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  }
  return String(c);
};

const MemberCard = ({ member, type }) => {
  const C = useColors();
  const s = makeMemberStyles(C);

  const getTypeIcon = () => {
    switch (type) {
      case 'manager':
        return { name: 'crown', color: C.warning };
      case 'assist':
        return { name: 'account-star', color: C.primary };
      case 'analyst':
        return { name: 'account-check', color: C.success };
      case 'observer':
        return { name: 'account-eye', color: C.text.secondary };
      default:
        return { name: 'account', color: C.text.secondary };
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
    <View style={s.memberCard}>
      <View style={s.memberAvatar}>
        <MaterialCommunityIcons name="account-circle" size={40} color={C.text.tertiary} />
        <View style={[s.typeIndicator, { backgroundColor: typeIcon.color }]}>
          <MaterialCommunityIcons name={typeIcon.name} size={12} color={C.background.primary} />
        </View>
      </View>

      <View style={s.memberInfo}>
        <Text style={s.memberName}>{_str(member.name || member.full_name)}</Text>
        {!!_str(member.role) && <Text style={s.memberRole}>{_str(member.role)}</Text>}
        {!!_councilStr(member.council) && (
          <Text style={s.memberCouncil}>{_councilStr(member.council)}</Text>
        )}
        <Text style={[s.memberType, { color: typeIcon.color }]}>{typeLabel}</Text>
      </View>
    </View>
  );
};

const makeMemberStyles = (C) => ({
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.secondary,
    borderRadius: BorderRadius.md,
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
    borderColor: C.background.primary,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
  },
  memberRole: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    marginTop: 2,
  },
  memberCouncil: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    marginTop: 1,
  },
  memberType: {
    fontSize: 10.5,
    fontFamily: Typography.fontFamily.semiBold,
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

const GroupCard = ({ group, initialExpanded = false, onCardLayout, customColor, showColorPicker = false, onColorChange }) => {
  const C = useColors();
  const s = makeGroupCardStyles(C);

  const [expanded, setExpanded] = useState(initialExpanded);
  const [fullMembers, setFullMembers] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const { token } = useContext(AuthContext);
  const { getGroupMembers } = useGroups();

  const displayColor = customColor || group.color || C.primary;

  // Aurora groups (isAuroraGroup) vêm com membros no contexto via
  // fetchAuroraGroupMembers. WebClient groups têm manager/assists/etc no doc
  // do grupo e fetchFullGroupDetails bate na PlantãoAPI.
  const isAuroraGroup = group.isAuroraGroup === true;

  const auroraMembers = isAuroraGroup
    ? (getGroupMembers(group.id) || []).map(m => {
        const p = m.person || {};
        return {
          id: p.id || m.userId,
          name: p.name || '',
          full_name: p.name || '',
          photo: p.photo || null,
          council: p.council || '',
          role: p.role || 'Médico',
          type: m.memberType || 'member',
        };
      })
    : [];

  const partialMembers = isAuroraGroup
    ? auroraMembers
    : [
        ...(group.manager ? [{ ...group.manager, type: 'manager' }] : []),
        ...(group.assists || []).map(m => ({ ...m, type: 'assist' })),
        ...(group.analysts || []).map(m => ({ ...m, type: 'analyst' })),
        ...(group.observers || []).map(m => ({ ...m, type: 'observer' })),
      ];

  const totalMembers = group.total_users || partialMembers.length;

  const displayMembers = fullMembers || partialMembers;

  const filteredMembers = memberSearch.trim()
    ? displayMembers.filter(m => {
        const name = (m.name || m.full_name || '').toLowerCase();
        return name.includes(memberSearch.trim().toLowerCase());
      })
    : displayMembers;

  const fetchFullGroupDetails = async () => {
    // Sem webClient: membros vêm do contexto (grupos aurora) ou do próprio doc
    // do grupo (manager/assists/analysts/observers). Nada a buscar na PlantãoAPI.
  };

  const handleToggleExpand = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      fetchFullGroupDetails();
    }
  };

  useEffect(() => {
    if (initialExpanded) {
      fetchFullGroupDetails();
    }
  }, [initialExpanded]);

  return (
    <View
      style={s.groupCard}
      onLayout={(e) => {
        if (onCardLayout) {
          onCardLayout(group.id, e.nativeEvent.layout.y);
        }
      }}
    >
      <TouchableOpacity
        style={s.groupHeader}
        onPress={handleToggleExpand}
      >
        <View style={s.groupInfo}>
          <View style={s.groupTitleRow}>
            <View style={[s.groupColorDot, { backgroundColor: displayColor }]} />
            <Text style={s.groupName}>{group.name}</Text>
            {group.is_personal && (
              <View style={s.personalBadge}>
                <Text style={s.personalBadgeText}>Pessoal</Text>
              </View>
            )}
          </View>

          {group.institution && (
            <Text style={s.groupInstitution}>{group.institution.name}</Text>
          )}

          <View style={s.groupStats}>
            <View style={s.statItem}>
              <MaterialCommunityIcons name="account-group" size={16} color={C.text.secondary} />
              <Text style={s.statText}>{totalMembers} membros</Text>
            </View>

            {group.unread_notices > 0 && (
              <View style={s.statItem}>
                <MaterialCommunityIcons name="bell" size={16} color={C.warning} />
                <Text style={[s.statText, { color: C.warning }]}>
                  {group.unread_notices} avisos
                </Text>
              </View>
            )}

            {group.is_admin && (
              <View style={s.adminBadge}>
                <MaterialCommunityIcons name="shield-crown" size={14} color={C.warning} />
                <Text style={[s.statText, { color: C.warning }]}>Admin</Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={C.text.secondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={s.groupMembers}>
          {showColorPicker && (
            <View style={s.colorPickerSection}>
              <Text style={s.colorPickerLabel}>Cor do grupo</Text>
              <View style={s.colorPaletteRow}>
                {COLOR_PALETTE.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => onColorChange && onColorChange(color)}
                    style={[
                      s.colorSwatch,
                      { backgroundColor: color },
                      displayColor === color && s.colorSwatchSelected,
                    ]}
                  >
                    {displayColor === color && (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
                {customColor && (
                  <TouchableOpacity
                    onPress={() => onColorChange && onColorChange(null)}
                    style={s.colorSwatchReset}
                  >
                    <Ionicons name="refresh" size={12} color={C.text.tertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          {loadingMembers ? (
            <View style={s.membersLoadingContainer}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={s.membersLoadingText}>Carregando membros...</Text>
            </View>
          ) : (
            <>
              <Text style={s.membersTitle}>
                {memberSearch.trim()
                  ? `${filteredMembers.length} de ${displayMembers.length} membros`
                  : `Membros (${displayMembers.length})`
                }
              </Text>

              {displayMembers.length > 5 && (
                <View style={s.memberSearchWrapper}>
                  <Ionicons name="search" size={16} color={C.text.tertiary} />
                  <TextInput
                    style={s.memberSearchInput}
                    placeholder="Buscar membro..."
                    placeholderTextColor={C.text.placeholder}
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {memberSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setMemberSearch('')}>
                      <Ionicons name="close-circle" size={16} color={C.text.tertiary} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {filteredMembers.length === 0 ? (
                <Text style={s.noMembersText}>Nenhum membro encontrado para "{memberSearch}"</Text>
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

const makeGroupCardStyles = (C) => ({
  groupCard: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: 16,
    ...Shadows.medium,
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
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.primary,
    flex: 1,
  },
  personalBadge: {
    backgroundColor: C.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 8,
  },
  personalBadgeText: {
    fontSize: 9.5,
    fontFamily: Typography.fontFamily.bold,
    color: C.primary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  groupInstitution: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    marginBottom: 6,
    marginLeft: 22,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginLeft: 22,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.warning + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  groupMembers: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  membersTitle: {
    fontSize: 11.5,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  membersLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  membersLoadingText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
  },
  noMembersText: {
    fontSize: 13,
    color: C.text.tertiary,
    textAlign: 'center',
    paddingVertical: 12,
    fontStyle: 'italic',
  },
  memberSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.secondary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    gap: 6,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 13,
    color: C.text.primary,
    paddingVertical: 2,
  },
  colorPickerSection: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
  },
  colorPickerLabel: {
    fontSize: 11.5,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: C.background.card,
    ...Shadows.small,
  },
  colorSwatchReset: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background.secondary,
    borderWidth: 0.5,
    borderColor: C.border.light,
  },
});

const GroupsScreen = ({ navigation, focusGroupId = null, onRefreshReady }) => {
  const { groups: rawGroups, loading, error, loadGroups } = useGroups();
  const { token, user } = useContext(AuthContext);
  const C = useColors();
  const s = makeStyles(C);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('meus');
  const [groupFilter, setGroupFilter] = useState('');
  const scrollViewRef = useRef(null);
  const groupCardPositions = useRef({});
  const groupsListOffsetY = useRef(0);
  const hasScrolledToFocus = useRef(false);
  const [groupColors, setGroupColors] = useState({});

  const [allGroups, setAllGroups] = useState([]);
  const [allGroupsLoading, setAllGroupsLoading] = useState(false);
  const [allGroupsLoaded, setAllGroupsLoaded] = useState(false);

  const groups = Array.isArray(rawGroups) ? rawGroups : [];
  const userId = user?.id || user?.userId;

  useEffect(() => {
    if (!userId) return;
    getGroupColors(userId).then(colors => setGroupColors(colors));
  }, [userId]);

  const handleColorChange = async (groupId, color) => {
    if (!userId) return;
    await saveGroupColor(userId, groupId, color);
    setGroupColors(prev => {
      const updated = { ...prev };
      if (color === null) {
        delete updated[String(groupId)];
      } else {
        updated[String(groupId)] = color;
      }
      return updated;
    });
  };

  const meusGrupos = groups;
  const displayedGroups = activeTab === 'meus' ? meusGrupos : allGroups;

  const filteredGroups = groupFilter.trim()
    ? displayedGroups.filter(g =>
        g.name.toLowerCase().includes(groupFilter.trim().toLowerCase())
      )
    : displayedGroups;

  const handleCardLayout = (groupId, y) => {
    groupCardPositions.current[groupId] = y;

    if (focusGroupId && groupId === focusGroupId && !hasScrolledToFocus.current) {
      hasScrolledToFocus.current = true;
      setTimeout(() => {
        if (scrollViewRef.current) {
          const scrollTarget = groupsListOffsetY.current + y;
          scrollViewRef.current.scrollTo({
            y: scrollTarget,
            animated: true,
          });
        }
      }, 400);
    }
  };

  const handleGroupsListLayout = (e) => {
    groupsListOffsetY.current = e.nativeEvent.layout.y;
  };

  const loadAllGroups = async () => {
    if (allGroupsLoaded || allGroupsLoading) return;
    // Sem webClient: "Todos" reflete os grupos já conhecidos no contexto
    // (mesma fonte de "Meus"), sem descobrir grupos via PlantãoAPI.
    setAllGroups((rawGroups || []).filter(g => !g.is_removed));
    setAllGroupsLoaded(true);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'todos' && !allGroupsLoaded) {
      loadAllGroups();
    }
  };

  useEffect(() => {
    if (focusGroupId && groups.length > 0) {
      const isInMeus = meusGrupos.some(g => g.id === focusGroupId);
      if (isInMeus) {
        setActiveTab('meus');
      } else {
        setActiveTab('todos');
        if (!allGroupsLoaded) loadAllGroups();
      }
    }
  }, [focusGroupId, groups.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadGroups();
      if (activeTab === 'todos') {
        setAllGroupsLoaded(false);
        await loadAllGroups();
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível atualizar os grupos');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;

  useEffect(() => {
    onRefreshReady?.(() => handleRefreshRef.current());
    return () => onRefreshReady?.(null);
  }, []);

  const renderTabs = () => (
    <View style={s.tabsBar}>
      <Pressable
        style={[s.tab, activeTab === 'meus' && s.tabActive]}
        onPress={() => handleTabChange('meus')}
      >
        <Text style={[s.tabText, activeTab === 'meus' && s.tabTextActive]}>
          Meus grupos
        </Text>
        <Text style={[s.tabCount, activeTab === 'meus' && s.tabCountActive]}>
          {meusGrupos.length}
        </Text>
      </Pressable>

      <Pressable
        style={[s.tab, activeTab === 'todos' && s.tabActive]}
        onPress={() => handleTabChange('todos')}
      >
        <Text style={[s.tabText, activeTab === 'todos' && s.tabTextActive]}>
          Todos os grupos
        </Text>
        {allGroupsLoaded && (
          <Text style={[s.tabCount, activeTab === 'todos' && s.tabCountActive]}>
            {allGroups.length}
          </Text>
        )}
      </Pressable>
    </View>
  );

  const renderContent = () => {
    if (loading && groups.length === 0) {
      return (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.loadingText}>Carregando grupos...</Text>
        </View>
      );
    }

    if (error && groups.length === 0) {
      return (
        <View style={s.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={C.error} />
          <Text style={s.errorTitle}>Erro ao carregar grupos</Text>
          <Text style={s.errorMessage}>{error}</Text>
          <TouchableOpacity style={s.retryButton} onPress={loadGroups}>
            <Text style={s.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const emptyTabMessage = activeTab === 'meus'
      ? 'Você não faz parte de nenhum grupo.'
      : 'Nenhum grupo encontrado na organização.';

    const isTabLoading = activeTab === 'todos' && allGroupsLoading;

    return (
      <ScrollView
        ref={scrollViewRef}
        style={s.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
      >
        {renderTabs()}

        {/* Busca/filtro de grupos */}
        <View style={s.searchContainer}>
          <View style={s.searchInputWrapper}>
            <Ionicons name="search" size={18} color={C.text.tertiary} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar grupo..."
              placeholderTextColor={C.text.placeholder}
              value={groupFilter}
              onChangeText={setGroupFilter}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {groupFilter.length > 0 && (
              <TouchableOpacity onPress={() => setGroupFilter('')} style={s.clearSearchButton}>
                <Ionicons name="close-circle" size={18} color={C.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isTabLoading ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Carregando todos os grupos...</Text>
          </View>
        ) : filteredGroups.length === 0 ? (
          <View style={s.emptyTabContainer}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={C.text.tertiary} />
            <Text style={s.emptyTabText}>
              {groupFilter.trim()
                ? `Nenhum grupo encontrado para "${groupFilter}"`
                : emptyTabMessage}
            </Text>
          </View>
        ) : (
          <View style={s.groupsList} onLayout={handleGroupsListLayout}>
            {filteredGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                initialExpanded={focusGroupId === group.id}
                onCardLayout={handleCardLayout}
                customColor={groupColors[String(group.id)] || null}
                showColorPicker={activeTab === 'meus'}
                onColorChange={(color) => handleColorChange(group.id, color)}
              />
            ))}
          </View>
        )}

      </ScrollView>
    );
  };

  return (
    <View style={s.container}>
      {renderContent()}
    </View>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },
  scrollView: {
    flex: 1,
  },
  groupsList: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    marginTop: Spacing.md,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.primary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 19,
  },
  retryButton: {
    backgroundColor: C.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: Spacing.lg,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  // Padrão segmented pill — mesmo de TrocasAbertasScreen.
  tabsBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing.screen,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: 999,
    backgroundColor: C.background.elevated,
    borderWidth: 0.5,
    borderColor: C.border.light,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: C.background.card, ...Shadows.small },
  tabText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },
  tabTextActive: { color: C.text.primary },
  tabCount: { fontSize: 11, fontWeight: '700', color: C.text.quaternary },
  tabCountActive: { color: C.primary },
  emptyTabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 40,
  },
  emptyTabText: {
    fontSize: 14,
    color: C.text.secondary,
    textAlign: 'center',
    marginTop: 12,
  },
  searchContainer: {
    paddingHorizontal: Spacing.screen,
    marginBottom: Spacing.md,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.elevated,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: C.border.light,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.primary,
    paddingVertical: 2,
  },
  clearSearchButton: {
    padding: 4,
  },
});

export default GroupsScreen;
