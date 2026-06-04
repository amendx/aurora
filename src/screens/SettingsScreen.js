import React, { useContext, useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Switch, Image, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups } from '../contexts/GroupsContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import { registerScrollToTop } from '../utils/scrollToTopBus';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import LocalCache from '../services/LocalCache';
import * as SecureStore from 'expo-secure-store';
import TimeUtils from '../utils/TimeUtils';
import Logger from '../utils/Logger';

// Parse "07h00 - 13h00 (M)" → ["07:00", "13:00"]. Helper compartilhado.
const _parseTimeParts = (timeStr) => {
  if (!timeStr) return null;
  let parts = String(timeStr).split(' – ');
  if (parts.length !== 2) parts = String(timeStr).split(' - ');
  if (parts.length !== 2) return null;
  const norm = t => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
  return [norm(parts[0]), norm(parts[1])];
};

// Parse "07h00 - 13h00 (M)" → 360 min. webClient shifts não trazem
// durationMinutes do PlantaoAPI; sem isso, o caminho aurora computa 0h.
const _shiftDurationMinutes = (shift) => {
  if (typeof shift?.durationMinutes === 'number' && shift.durationMinutes > 0) {
    return shift.durationMinutes;
  }
  const tp = _parseTimeParts(shift?.time);
  if (tp) {
    const min = TimeUtils.calculateDurationMinutes(tp[0], tp[1]);
    if (min !== null && min > 0) return min;
  }
  return TimeUtils.getShiftStandardMinutes(shift?.label) || 0;
};

// Constrói startISO/endISO + crossesMidnight a partir de date + time.
// Botões Ceder/Trocar dependem de startISO (gate `startTs > Date.now()`).
const _buildShiftISOs = (shift) => {
  if (shift?.startISO && shift?.endISO) {
    return { startISO: shift.startISO, endISO: shift.endISO, crossesMidnight: !!shift.crossesMidnight };
  }
  const date = shift?.date;
  const tp = _parseTimeParts(shift?.time);
  if (!date || !tp) return {};
  const [startHM, endHM] = tp;
  const startISO = `${date}T${startHM}:00`;
  const [sh, sm] = startHM.split(':').map(Number);
  const [eh, em] = endHM.split(':').map(Number);
  const crossesMidnight = (eh * 60 + em) < (sh * 60 + sm);
  let endISO;
  if (crossesMidnight) {
    const next = new Date(date + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    const nd = next.toISOString().slice(0, 10);
    endISO = `${nd}T${endHM}:00`;
  } else {
    endISO = `${date}T${endHM}:00`;
  }
  return { startISO, endISO, crossesMidnight };
};

const SettingsScreen = ({ navigation }) => {
  const scrollRef = useRef(null);
  useEffect(() => registerScrollToTop('settings', () => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }), []);
  const { logout, user, setAuroraOnlyMode } = useContext(AuthContext);
  const { isDark, setTheme } = useTheme();
  const { groupsById, coworkersById, membersByGroupId } = useGroups();
  const { loadMonthlyShifts } = useShifts();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const s = makeStyles(C);
  const [auroraSyncing, setAuroraSyncing] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'Usuário';
  const fullName  = user?.name || 'Usuário';
  const hasWebClient = !!(user?.data?.id || user?.webClientToken);
  const isAuroraNative = user?.source === 'aurora';
  const auroraOnly = !!user?.auroraOnlyMode;

  const handleLogout = () => {
    Alert.alert('Sair da Conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  // Collect every shift currently in LocalCache (every month-key for this user).
  // Used both on first activation and on manual "Sincronizar com webClient".
  const _collectLocalCacheShifts = async () => {
    const uid = String(user?.id || '');
    if (!uid) return [];
    const allKeys = await AsyncStorage.getAllKeys();
    const shiftKeys = allKeys.filter(k => k.startsWith(`aurora_shifts_${uid}_`));
    const collected = [];
    for (const k of shiftKeys) {
      try {
        const raw = await AsyncStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const days = parsed?.daysWithShifts || [];
        for (const d of days) {
          for (const sh of (d.shifts || [])) {
            if (!sh?.id) continue;
            const monthKey = sh.monthKey || (sh.date ? String(sh.date).slice(0, 7) : null);
            if (!monthKey) continue;
            // Snapshot só inclui plantões reais — webClient (com `time` string)
            // ou criados pelo app (`isManual:true`). Filtra seeds/lixo gravado
            // direto no Firestore que não veio do PlantaoAPI nem do user.
            const isReal = !!sh.time || sh.isManual === true;
            if (!isReal) continue;
            collected.push({
              ...sh,
              monthKey,
              durationMinutes: _shiftDurationMinutes(sh),
              ..._buildShiftISOs(sh),
            });
          }
        }
      } catch (err) {
        Logger.warn(`SettingsScreen: failed to parse ${k}: ${err?.message}`);
      }
    }
    return collected;
  };

  const _runSnapshot = async () => {
    const shifts = await _collectLocalCacheShifts();
    if (!shifts.length) {
      throw new Error('Nenhum plantão em cache. Abra a Home para carregar primeiro.');
    }
    const r = await FirebaseAdapter.snapshotWebClientToAurora(user.id, shifts);
    if (!r?.success) throw new Error(r?.error || 'Falha ao gravar snapshot.');

    // Também espelha o grafo (grupos + colegas + memberships) pra ela conseguir
    // trocar com todo mundo que já compartilhava grupo no webClient. Sem isso,
    // a aba "Plantão do colega" só mostraria quem foi seedado em Firestore.
    const g = await FirebaseAdapter.snapshotWebClientGraph(user.id, {
      groups: groupsById,
      coworkers: coworkersById,
      membersByGroupId,
    });
    if (!g?.success) {
      Logger.warn(`graph snapshot warn: ${g?.error}`);
    } else {
      Logger.info(`graph snapshot: groups=${g.groups} persons=${g.persons} memberships=${g.memberships}`);
    }

    return r.written || shifts.length;
  };

  const handleToggleAuroraOnly = async (next) => {
    if (next) {
      Alert.alert(
        'Usar Aurora como fonte?',
        'Vamos copiar seus plantões atuais para o Aurora. A partir daí, eles ficam como seus — você pode trocar e ceder livremente. PlantãoAPI deixa de ser consultada.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ativar',
            onPress: async () => {
              setAuroraSyncing(true);
              try {
                const written = await _runSnapshot();
                const now = new Date().toISOString();
                await setAuroraOnlyMode(true, now);
                // Força reload pra ShiftsContext entrar no branch aurora
                // (lê Firestore com source='aurora' = botões Ceder/Trocar liberados).
                const _now = new Date();
                await loadMonthlyShifts(_now.getMonth() + 1, _now.getFullYear(), true);
                Alert.alert('Pronto', `${written} plantões prontos para usar no Aurora.`);
              } catch (err) {
                Alert.alert('Erro', err?.message || 'Não foi possível ativar.');
              } finally {
                setAuroraSyncing(false);
              }
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Desligar modo Aurora?',
      'Vamos refrescar os plantões do PlantãoAPI e atualizar o snapshot. Plantões aurora-only (recebidos, manuais) seguem visíveis e trocáveis.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desligar',
          style: 'destructive',
          onPress: async () => {
            setAuroraSyncing(true);
            try {
              // 1) flip the gate so ShiftsContext volta a ler do PlantaoAPI
              await setAuroraOnlyMode(false);
              // 2) força reload do mês atual (vai bater na PlantaoAPI)
              const now = new Date();
              await loadMonthlyShifts(now.getMonth() + 1, now.getFullYear(), true);
              // 3) re-snapshot pra Firestore — mantém o snapshot fresco pra próxima ativação
              try {
                const written = await _runSnapshot();
                const ts = new Date().toISOString();
                await setAuroraOnlyMode(false, ts); // mantém flag off, só atualiza a data
                Logger.info(`re-snapshot pós-OFF: ${written} plantões`);
              } catch (snapErr) {
                Logger.warn(`re-snapshot pós-OFF falhou: ${snapErr?.message}`);
              }
            } finally {
              setAuroraSyncing(false);
            }
          },
        },
      ],
    );
  };

  const handleSyncWebClient = () => {
    Alert.alert(
      'Sincronizar com webClient',
      'Vamos sobrescrever o snapshot atual com os plantões mais recentes do PlantãoAPI. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sincronizar',
          onPress: async () => {
            setAuroraSyncing(true);
            try {
              // To pull fresh data, we need to temporarily turn off auroraOnlyMode so
              // ShiftsContext rehydrates from PlantaoAPI. Simpler approach: just snapshot
              // whatever is in LocalCache now (caller is expected to have refreshed Home).
              const written = await _runSnapshot();
              const now = new Date().toISOString();
              await setAuroraOnlyMode(true, now);
              const _now = new Date();
              await loadMonthlyShifts(_now.getMonth() + 1, _now.getFullYear(), true);
              Alert.alert('Pronto', `Snapshot atualizado com ${written} plantões.`);
            } catch (err) {
              Alert.alert('Erro', err?.message || 'Falha ao sincronizar.');
            } finally {
              setAuroraSyncing(false);
            }
          },
        },
      ],
    );
  };

  // Recovery helper for the unscoped-real_hours bug: wipes ALL time entries
  // for the current user from LocalCache + apaga a chave legada (sem uid)
  // do SecureStore pra impedir nova contaminação via runMigration.
  const handlePurgeTimeEntries = () => {
    Alert.alert(
      'Limpar horas registradas?',
      'Apaga TODAS as horas reais cadastradas pra essa conta (em todos os meses). Use se a "ganhos previstos / horas reais" estiverem mostrando valores que não são seus. Os plantões em si não são afetados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              const removed = await LocalCache.clearTimeEntries(user.id);
              // Enumerar e apagar chaves legadas (sem uid) dos últimos 13 meses
              // — mesmo escopo que a migration original cobre.
              const now = new Date();
              let legacyRemoved = 0;
              for (let m = 0; m < 13; m++) {
                const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
                const lastDay = new Date(now.getFullYear(), now.getMonth() - m + 1, 0).getDate();
                for (let day = 1; day <= lastDay; day++) {
                  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  try {
                    const v = await SecureStore.getItemAsync(`real_hours_${dateStr}`);
                    if (v) {
                      await SecureStore.deleteItemAsync(`real_hours_${dateStr}`);
                      legacyRemoved++;
                    }
                  } catch {}
                }
              }
              // webClient (sem aurora-only): força refetch dos plantões na PlantaoAPI
              // pra recalcular horas zeradas com dados frescos. Equivalente ao
              // pull-to-refresh da Home. Aurora puro / aurora-only não precisam
              // — eles re-hidratam direto do Firestore no próximo load.
              let refreshed = false;
              if (!isAuroraNative && !auroraOnly) {
                try {
                  const _now = new Date();
                  await loadMonthlyShifts(_now.getMonth() + 1, _now.getFullYear(), true);
                  refreshed = true;
                } catch (refreshErr) {
                  Logger.warn(`refetch pós-limpeza falhou: ${refreshErr?.message}`);
                }
              }
              Alert.alert(
                'Pronto',
                `${removed} meses limpos no LocalCache, ${legacyRemoved} chaves legadas removidas.${refreshed ? '\nPlantões revalidados no PlantãoAPI.' : '\nReabra a Home pra recalcular.'}`,
              );
            } catch (err) {
              Alert.alert('Erro', err?.message || 'Falha ao limpar.');
            }
          },
        },
      ],
    );
  };

  const _fmtSnapshotDate = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
  };
  const lastSnap = _fmtSnapshotDate(user?.auroraSnapshotAt);

  const Row = ({ icon, label, hint, accent, onPress, last }) => (
    <View>
      <Pressable
        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
        onPress={onPress}
      >
        <View style={[s.rowIcon, accent && { backgroundColor: C.moneySoft }]}>
          <Ionicons name={icon} size={16} color={accent ? C.money : C.primary} />
        </View>
        <View style={s.rowBody}>
          <Text style={s.rowLabel}>{label}</Text>
          {hint ? <Text style={s.rowHint}>{hint}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
      </Pressable>
      {!last && <View style={s.sep} />}
    </View>
  );

  const SL = ({ children, top }) => (
    <Text style={[s.sectionLabel, top && { marginTop: Spacing.lg }]}>{children}</Text>
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={s.container}
      contentContainerStyle={{ paddingBottom: Spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.pageHeader}>
        <Text style={s.eyebrow}>Configurações</Text>
        <Text style={s.pageTitle}>Sua conta</Text>
      </View>

      <View style={s.heroWrap}>
        <View style={s.heroCard}>
          <View style={s.heroDecor} />
          {user?.photo
            ? <Image source={{ uri: user.photo }} style={s.avatarImg} />
            : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
              </View>
            )
          }
          <View style={{ flex: 1, position: 'relative' }}>
            <Text style={s.heroName} numberOfLines={1}>{fullName}</Text>
            {user?.email ? <Text style={s.heroEmail} numberOfLines={1}>{user.email}</Text> : null}
            <View style={s.badgeRow}>
              <View style={[s.badge, { backgroundColor: C.moneySoft }]}>
                <Ionicons name="checkmark" size={9} color={C.money} />
                <Text style={[s.badgeText, { color: C.money }]}>Aurora</Text>
              </View>
              {hasWebClient && (
                <View style={[s.badge, { backgroundColor: C.background.secondary }]}>
                  <Text style={[s.badgeText, { color: C.text.secondary }]}>PlantãoAPI</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <SL>Conta</SL>
      <View style={s.card}>
        <Row icon="person-outline"        label="Perfil"                  hint="Foto, nome, informações"      onPress={() => navigation?.navigate?.('Profile')} />
        <Row icon="people-outline"        label="Grupos"                  hint="Seus grupos e equipes"         onPress={() => navigation?.navigate?.('GroupsScreen')} />
        <Row icon="eye-outline"           label="Visibilidade de equipes" hint="Quem aparece no seu plantão"   onPress={() => navigation?.navigate?.('GroupVisibilityScreen')} />
        <Row icon="notifications-outline" label="Notificações"            hint="Ofertas, trocas e atualizações" onPress={() => navigation?.navigate?.('NotificationsSettingsScreen')} />
        <Row icon="swap-horizontal-outline" label="Histórico"              hint="Cessões e trocas, pendentes e passadas" onPress={() => navigation?.navigate?.('Historico')} />
        <Row icon="terminal-outline"      label="Minhas ações"            hint="Log da sessão (debug)"           onPress={() => navigation?.navigate?.('ActivityLog')} last />
      </View>

      {/* [WEBCLIENT-BRIDGE] — Inteiro este bloco só existe pra migração
          webClient → aurora. Quando o webClient for desativado, remova:
          - este bloco JSX inteiro
          - imports/states `useGroups`, `useShifts`, `auroraSyncing`, helpers
            `_collectLocalCacheShifts`, `_runSnapshot`, `_fmtSnapshotDate`,
            `handleToggleAuroraOnly`, `handleSyncWebClient`, `lastSnap`. */}
      <SL top>Aparência</SL>
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.rowIcon}>
            <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={16} color={C.primary} />
          </View>
          <View style={s.rowBody}>
            <Text style={s.rowLabel}>Modo escuro</Text>
            <Text style={s.rowHint}>Acompanha o sistema</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
            trackColor={{ false: C.border.medium, true: C.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <SL top>Manutenção</SL>
      <View style={s.card}>
        <Pressable
          style={({ pressed }) => [s.row, pressed && s.rowPressed]}
          onPress={handlePurgeTimeEntries}
        >
          <View style={[s.rowIcon, { backgroundColor: C.error + '14' }]}>
            <Ionicons name="time-outline" size={16} color={C.error} />
          </View>
          <View style={s.rowBody}>
            <Text style={s.rowLabel}>Limpar horas registradas</Text>
            <Text style={s.rowHint}>Use se as horas/ganhos mostram valores que não são seus</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </Pressable>
      </View>

      <SL top>Plantões & valores</SL>
      <View style={s.card}>
        <Row icon="business-outline"      label="Meus hospitais"  hint="Valores, fidelização e bônus por hospital" accent onPress={() => navigation?.navigate?.('HospitalsScreen')} />
        {/* Global "Valores e bônus" (ConfigScreen) intentionally hidden — per-hospital
            is now the primary path. Re-enable this Row to roll back to the global UI. */}
        {/* <Row icon="cash-outline"          label="Valores e bônus" hint="Hora-base, fidelização, FDS" onPress={() => navigation?.navigate?.('ConfigScreen')} /> */}
        <Row icon="document-text-outline" label="Relatórios"      hint="Histórico e exportação"            onPress={() => navigation?.navigate?.('Reports')} last />
      </View>

      {!isAuroraNative && (
        <>
          <SL top>Fonte dos plantões</SL>
          <View style={s.card}>
            <View style={s.row}>
              <View style={s.rowIcon}>
                <Ionicons name="cloud-done-outline" size={16} color={C.primary} />
              </View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>Usar Aurora como fonte</Text>
                <Text style={s.rowHint}>
                  {auroraOnly
                    ? 'Plantões prontos pra trocar e ceder.'
                    : 'Importa do PlantãoAPI para o Aurora — você passa a ser dono.'}
                </Text>
              </View>
              {auroraSyncing ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Switch
                  value={auroraOnly}
                  onValueChange={handleToggleAuroraOnly}
                  trackColor={{ false: C.border.medium, true: C.primary }}
                  thumbColor="#fff"
                />
              )}
            </View>
            {auroraOnly && lastSnap && (
              <>
                <View style={s.sep} />
                <Pressable
                  style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                  onPress={auroraSyncing ? undefined : handleSyncWebClient}
                >
                  <View style={s.rowIcon}>
                    <Ionicons name="refresh" size={16} color={C.primary} />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowLabel}>Sincronizar com webClient</Text>
                    <Text style={s.rowHint}>Último snapshot: {lastSnap}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
                </Pressable>
              </>
            )}
          </View>
        </>
      )}

      <View style={s.logoutWrap}>
        <Pressable style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={14} color={C.error} />
          <Text style={s.logoutText}>Sair da conta</Text>
        </Pressable>
        <Text style={s.version}>v 1.0.0</Text>
      </View>
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  container: { flex: 1, backgroundColor: C.background.secondary },
  pageHeader: { paddingHorizontal: Spacing.screen, paddingTop: 14, paddingBottom: 18 },
  eyebrow: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 1 },
  pageTitle: { fontSize: 30, fontFamily: Typography.fontFamily.display, color: C.text.primary, letterSpacing: -0.6, marginTop: 2 },

  heroWrap: { paddingHorizontal: Spacing.screen, paddingBottom: Spacing.md },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.background.elevated, borderRadius: 18, padding: 14,
    borderWidth: 0.5, borderColor: C.border.light, overflow: 'hidden', position: 'relative',
    ...Shadows.small,
  },
  heroDecor: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: C.accentSoft, opacity: 0.5 },
  avatarImg: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 22, fontFamily: Typography.fontFamily.bold, color: C.primary },
  heroName: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  heroEmail: { fontSize: 12, color: C.text.secondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },

  sectionLabel: {
    fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.screen,
  },
  card: {
    marginHorizontal: Spacing.screen, backgroundColor: C.background.elevated,
    borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border.light,
    ...Shadows.small,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12, minHeight: 52 },
  rowPressed: { backgroundColor: C.background.tertiary },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  rowHint: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  sep: { height: 0.5, backgroundColor: C.border.light, marginLeft: 58 },

  logoutWrap: { paddingTop: 28, paddingBottom: Spacing.sm, alignItems: 'center', gap: 16 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold, color: C.error },
  version: { fontSize: 11, color: C.text.tertiary },
});

export default SettingsScreen;
