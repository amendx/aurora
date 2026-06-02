import React, { createContext, useContext, useState, useEffect } from 'react';
import WebClientApiService from '../services/WebClientApiService';
import Logger from '../utils/Logger';
import { AuthContext } from '../context/AuthContext';
import { StorageService } from '../utils/StorageService';
import LocalCache from '../services/LocalCache';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';

const GroupsContext = createContext();

export const useGroups = () => {
  const context = useContext(GroupsContext);
  if (!context) {
    throw new Error('useGroups must be used within a GroupsProvider');
  }
  return context;
};

export const GroupsProvider = ({ children }) => {
  const { token, user } = useContext(AuthContext);
  const userId = user?.id || 0;
  const [groups, setGroups] = useState({});
  const [coworkers, setCoworkers] = useState({});
  const [membersByGroupId, setMembersByGroupId] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedFromApi, setHasLoadedFromApi] = useState(false);
  const loadingRef = React.useRef(false); // Evitar chamadas duplicadas

  // Normalizar pessoa (coworker)
  const normalizePerson = (person) => {
    if (!person || !person.id) return null;
    
    return {
      id: person.id,
      name: person.name || '',
      full_name: person.full_name || person.name || '',
      photo: person.photo || null,
      description: person.description || '',
      council: person.council || '',
      email: person.email || '',
      phone: person.phone || '',
      role: person.role || '',
      username: person.username || '',
      status: person.status || '',
      cpf: person.cpf || '',
      is_premium: person.is_premium || false
    };
  };

  // Normalizar grupo — preserva arrays de membros para exibição direta na UI
  const normalizeGroup = (group, isFromDaily = false) => {
    if (!group || !group.id) return null;

    // Normalizar cor: a API retorna sem "#", ex: "256fff"
    const rawColor = group.color || '007AFF';
    const color = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;

    return {
      id: group.id,
      name: group.name || '',
      color,
      is_personal: group.is_personal || false,
      is_removed: group.is_removed || false,
      logo: group.logo || null,
      is_admin: group.is_admin || false,
      total_users: group.total_users || 0,
      created_at: group.created_at || null,
      has_workingtime: group.has_workingtime || false,
      has_amount: group.has_amount || false,
      unread_notices: group.unread_notices || 0,
      institution: group.institution
        ? { id: group.institution.id, name: group.institution.name || '' }
        : null,
      // Arrays de membros preservados para renderização direta na UI
      manager: group.manager || null,
      assists: Array.isArray(group.assists) ? group.assists : [],
      analysts: Array.isArray(group.analysts) ? group.analysts : [],
      observers: Array.isArray(group.observers) ? group.observers : [],
      isFromDaily,
    };
  };

  // Extrair dados da requisição diária
  const extractFromDailyShifts = async (dailyData) => {
    try {
      Logger.debug('🏢 Extraindo grupos e coworkers da requisição diária');
      
      const newGroups = { ...groups };
      const newCoworkers = { ...coworkers };
      const newMembersByGroupId = { ...membersByGroupId };

      if (dailyData?.items) {
        dailyData.items.forEach(shift => {
          // Extrair grupo
          if (shift.group) {
            const normalizedGroup = normalizeGroup(shift.group, true);
            if (normalizedGroup) {
              newGroups[normalizedGroup.id] = normalizedGroup;
              
              // Inicializar membros do grupo se não existir
              if (!newMembersByGroupId[normalizedGroup.id]) {
                newMembersByGroupId[normalizedGroup.id] = [];
              }
            }
          }

          // Extrair coworkers do shift
          if (shift.coworkers && Array.isArray(shift.coworkers)) {
            shift.coworkers.forEach(coworker => {
              const normalizedPerson = normalizePerson(coworker);
              if (normalizedPerson) {
                newCoworkers[normalizedPerson.id] = normalizedPerson;
              }
            });
          }

          // Extrair coworkers da vacancy
          if (shift.vacancy?.coworkers && Array.isArray(shift.vacancy.coworkers)) {
            shift.vacancy.coworkers.forEach(coworker => {
              const normalizedPerson = normalizePerson(coworker);
              if (normalizedPerson) {
                newCoworkers[normalizedPerson.id] = normalizedPerson;
              }
            });
          }

          // Extrair user como coworker se disponível
          if (shift.user) {
            const normalizedPerson = normalizePerson(shift.user);
            if (normalizedPerson) {
              newCoworkers[normalizedPerson.id] = normalizedPerson;
            }
          }
        });
      }

      setGroups(newGroups);
      setCoworkers(newCoworkers);
      setMembersByGroupId(newMembersByGroupId);
      Logger.debug(`🏢 Extraídos ${Object.keys(newGroups).length} grupos e ${Object.keys(newCoworkers).length} coworkers`);
    } catch (error) {
      Logger.error('Erro ao extrair dados da requisição diária:', error);
    }
  };

  // Ao montar: tenta carregar cache primeiro
  useEffect(() => {
    loadPersistedData();
  }, []);

  // Quando o token chegar: carrega da API em background com delay
  // para não bloquear a experiência inicial (plantões/home)
  useEffect(() => {
    // [WEBCLIENT-BRIDGE] — the `!user?.auroraOnlyMode` predicate exists só pra
    // pular o load da PlantaoAPI quando o webClient virou aurora-only. Remova
    // junto com o resto da bridge quando o webClient for desativado.
    if (token && user?.source !== 'aurora' && !user?.auroraOnlyMode && !hasLoadedFromApi) {
      Logger.info('🏢 Token disponível, agendando carga de grupos em background...');
      const timer = setTimeout(() => {
        loadGroupsBackground();
      }, 5000); // 5s de delay — permite que home/plantões carreguem antes
      return () => clearTimeout(timer);
    }
  }, [token, hasLoadedFromApi]);

  // Carregar grupos completos da API
  const loadGroups = async () => {
    if (loadingRef.current) {
      Logger.info('🏢 Carga de grupos já em andamento, ignorando...');
      return;
    }
    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      Logger.debug('🏢 Carregando grupos da API /groups');

      const response = await WebClientApiService.getGroups(token);
      
      if (response?.data?.items) {
        const newGroups = { ...groups };
        const newCoworkers = { ...coworkers };
        const newMembersByGroupId = { ...membersByGroupId };

        response.data.items.forEach(group => {
          // Normalizar grupo completo
          const normalizedGroup = normalizeGroup(group, false);
          if (normalizedGroup) {
            // Merge com dados existentes, priorizando API completa
            newGroups[normalizedGroup.id] = {
              ...newGroups[normalizedGroup.id],
              ...normalizedGroup
            };

            // Processar membros do grupo
            const members = [];

            // Manager
            if (group.manager) {
              const normalizedManager = normalizePerson(group.manager);
              if (normalizedManager) {
                newCoworkers[normalizedManager.id] = {
                  ...newCoworkers[normalizedManager.id],
                  ...normalizedManager
                };
                members.push({
                  userId: normalizedManager.id,
                  memberType: 'manager'
                });
              }
            }

            // Assists
            if (group.assists && Array.isArray(group.assists)) {
              group.assists.forEach(person => {
                const normalizedPerson = normalizePerson(person);
                if (normalizedPerson) {
                  newCoworkers[normalizedPerson.id] = {
                    ...newCoworkers[normalizedPerson.id],
                    ...normalizedPerson
                  };
                  members.push({
                    userId: normalizedPerson.id,
                    memberType: 'assist'
                  });
                }
              });
            }

            // Analysts
            if (group.analysts && Array.isArray(group.analysts)) {
              group.analysts.forEach(person => {
                const normalizedPerson = normalizePerson(person);
                if (normalizedPerson) {
                  newCoworkers[normalizedPerson.id] = {
                    ...newCoworkers[normalizedPerson.id],
                    ...normalizedPerson
                  };
                  members.push({
                    userId: normalizedPerson.id,
                    memberType: 'analyst'
                  });
                }
              });
            }

            // Observers
            if (group.observers && Array.isArray(group.observers)) {
              group.observers.forEach(person => {
                const normalizedPerson = normalizePerson(person);
                if (normalizedPerson) {
                  newCoworkers[normalizedPerson.id] = {
                    ...newCoworkers[normalizedPerson.id],
                    ...normalizedPerson
                  };
                  members.push({
                    userId: normalizedPerson.id,
                    memberType: 'observer'
                  });
                }
              });
            }

            // Atualizar membros do grupo
            newMembersByGroupId[normalizedGroup.id] = members;
          }
        });

        setGroups(newGroups);
        setCoworkers(newCoworkers);
        setMembersByGroupId(newMembersByGroupId);

        // Salvar grupos no cache local para evitar overfetching
        await persistGroups(Object.values(newGroups));

        Logger.info(`🏢 ${Object.keys(newGroups).length} grupos carregados e cacheados`);
      }
      setHasLoadedFromApi(true);
    } catch (error) {
      Logger.error('Erro ao carregar grupos:', error);
      setError(error.message || 'Erro ao carregar grupos');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Carga silenciosa em background (sem mostrar loading na UI)
  const loadGroupsBackground = async () => {
    if (loadingRef.current || hasLoadedFromApi) return;
    try {
      loadingRef.current = true;
      // Não seta loading = true para não impactar a UI
      Logger.debug('🏢 [BG] Carregando grupos em background...');
      
      const response = await WebClientApiService.getGroups(token);
      
      if (response?.data?.items) {
        const newGroups = { ...groups };
        const newCoworkers = { ...coworkers };
        const newMembersByGroupId = { ...membersByGroupId };

        response.data.items.forEach(group => {
          const normalizedGroup = normalizeGroup(group, false);
          if (normalizedGroup) {
            newGroups[normalizedGroup.id] = {
              ...newGroups[normalizedGroup.id],
              ...normalizedGroup
            };
            const members = [];
            if (group.manager) {
              const nm = normalizePerson(group.manager);
              if (nm) { newCoworkers[nm.id] = { ...newCoworkers[nm.id], ...nm }; members.push({ userId: nm.id, memberType: 'manager' }); }
            }
            ['assists', 'analysts', 'observers'].forEach(role => {
              if (group[role] && Array.isArray(group[role])) {
                group[role].forEach(person => {
                  const np = normalizePerson(person);
                  if (np) { newCoworkers[np.id] = { ...newCoworkers[np.id], ...np }; members.push({ userId: np.id, memberType: role.replace(/s$/, '') }); }
                });
              }
            });
            newMembersByGroupId[normalizedGroup.id] = members;
          }
        });

        setGroups(newGroups);
        setCoworkers(newCoworkers);
        setMembersByGroupId(newMembersByGroupId);
        await persistGroups(Object.values(newGroups));
        Logger.info(`🏢 [BG] ${Object.keys(newGroups).length} grupos carregados silenciosamente`);
      }
      setHasLoadedFromApi(true);
    } catch (error) {
      Logger.error('Erro ao carregar grupos em background:', error);
      // Não seta error no background para não impactar a UI
    } finally {
      loadingRef.current = false;
    }
  };

  // Persistir grupos no StorageService e LocalCache (dual-write)
  const persistGroups = async (groupsData) => {
    try {
      // Keep existing SecureStore write for backward compat
      await StorageService.saveGroups(groupsData);
      // Also write to LocalCache (user-scoped, Firebase-ready)
      if (userId) {
        await LocalCache.saveGroups(userId, groupsData);
      }
    } catch (error) {
      Logger.error('Erro ao persistir grupos:', error);
    }
  };

  // Carregar grupos do cache local — prefer LocalCache, fall back to SecureStore
  const loadPersistedData = async () => {
    try {
      // Try LocalCache first (user-scoped, survives logout cleanly)
      if (userId) {
        const lcData = await LocalCache.getGroups(userId);
        if (lcData?.groups && Array.isArray(lcData.groups) && lcData.groups.length > 0) {
          const groupsMap = {};
          lcData.groups.forEach(g => { groupsMap[g.id] = g; });
          setGroups(groupsMap);
          Logger.info(`📦 ${lcData.groups.length} grupos carregados do LocalCache`);
        } else {
          // Fallback: legacy SecureStore cache
          const cached = await StorageService.getGroups();
          if (cached && Array.isArray(cached) && cached.length > 0) {
            const groupsMap = {};
            cached.forEach(g => { groupsMap[g.id] = g; });
            setGroups(groupsMap);
            Logger.info(`📦 ${cached.length} grupos carregados do cache legado`);
          }
        }
      }

    } catch (error) {
      Logger.error('Erro ao carregar grupos do cache:', error);
    }
  };

  // Aurora users: hydrate group memberships + persons from Firestore on login.
  // WebClient users get this from PlantaoAPI daily extraction (extractFromDailyShifts).
  useEffect(() => {
    // [WEBCLIENT-BRIDGE] — `|| user?.auroraOnlyMode` permite que o webClient
    // migrado também hidratze grupos do Firestore. Removível com a bridge.
    if ((user?.source !== 'aurora' && !user?.auroraOnlyMode) || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { groups: gList, membersByGroupId: mbgi, persons } = await FirebaseAdapter.fetchAuroraGroupMembers(userId);
        if (cancelled) return;
        if (gList.length) {
          const groupsMap = {};
          gList.forEach(g => { groupsMap[g.id] = g; });
          setGroups(prev => ({ ...prev, ...groupsMap }));
          LocalCache.saveGroups(userId, gList).catch(() => {});
        }
        if (Object.keys(mbgi).length) setMembersByGroupId(prev => ({ ...prev, ...mbgi }));
        if (Object.keys(persons).length) setCoworkers(prev => ({ ...prev, ...persons }));
        Logger.info(`👥 Aurora graph hydrated: ${gList.length} groups, ${Object.keys(mbgi).length} member-lists, ${Object.keys(persons).length} persons`);
      } catch (err) {
        Logger.warn(`Aurora group hydration falhou: ${err?.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, user?.source]);

  // Obter grupos do usuário
  const getUserGroups = () => {
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  };

  // Obter membros de um grupo
  const getGroupMembers = (groupId) => {
    const members = membersByGroupId[groupId] || [];
    return members.map(member => ({
      ...member,
      person: coworkers[member.userId]
    })).filter(member => member.person);
  };

  // Obter coworker por ID
  const getCoworker = (id) => {
    return coworkers[id] || null;
  };

  const value = {
    // Converter objetos para arrays com validação adicional
    groups: (groups && typeof groups === 'object') ? Object.values(groups) : [],
    coworkers: (coworkers && typeof coworkers === 'object') ? Object.values(coworkers) : [],
    groupsById: groups || {}, // Manter acesso por ID
    coworkersById: coworkers || {}, // Manter acesso por ID
    membersByGroupId: membersByGroupId || {},
    loading: loading || false,
    error: error || null,
    hasLoadedFromApi,
    extractFromDailyShifts,
    loadGroups,
    loadGroupsBackground,
    loadPersistedData,
    getUserGroups,
    getGroupMembers,
    getCoworker
  };

  return (
    <GroupsContext.Provider value={value}>
      {children}
    </GroupsContext.Provider>
  );
};