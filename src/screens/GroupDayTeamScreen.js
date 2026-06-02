import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import { useOffers } from '../contexts/OffersContext';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import GroupScheduleService from '../services/GroupScheduleService';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import Logger from '../utils/Logger';
import { getGroupVisibility } from '../utils/GroupVisibilityConfig';
import ActivityLogger from '../utils/ActivityLogger';
import CederFlowSheet from './CederFlowSheet';
import TrocarFlowSheet from './TrocarFlowSheet';

const MONTHS_FULL_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF' };
const LABEL_NAME = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const TURN_ORDER = ['M', 'T', 'N', 'D'];

const dateOnly = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const GroupDayTeamScreen = ({ navigation, date, groupIds }) => {
  const C = useColors();
  const { user, token } = useContext(AuthContext);
  const { groupsById } = useGroups();
  const { acceptOffer, rejectOffer, cancelOffer, acceptSwap, rejectSwap, cancelSwap, swapsSent, swapsReceived, offersSent, offersReceived } = useOffers();
  const s = makeStyles(C);

  const selectedDate = useMemo(
    () => (date instanceof Date ? date : new Date(date)),
    [date]
  );
  const dateStr = dateOnly(selectedDate);
  const monthKey = dateStr.slice(0, 7);
  const userId = user?.id || user?.data?.id || 0;
  const selfId = String(userId);

  const [visibleIds, setVisibleIds] = useState(null);
  useEffect(() => {
    if (!userId) return;
    getGroupVisibility(userId)
      .then(cfg => setVisibleIds(cfg?.enabledGroupIds ? cfg.enabledGroupIds.map(String) : null))
      .catch(() => {});
  }, [userId]);

  const groups = useMemo(() => {
    let ids;
    if (groupIds && groupIds.length) ids = groupIds.map(String);
    else if (visibleIds) ids = visibleIds;
    else ids = Object.keys(groupsById);
    return ids.map(id => groupsById[String(id)]).filter(Boolean);
  }, [groupIds, groupsById, visibleIds]);

  const [perGroup, setPerGroup] = useState({});
  const [loading, setLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Action sheets state
  const [cedeShift, setCedeShift] = useState(null);
  const [trocarVisible, setTrocarVisible] = useState(false);
  const [trocarShift, setTrocarShift] = useState(null);
  const [trocarPresetTargetUserId, setTrocarPresetTargetUserId] = useState(null);
  const [trocarPresetTargetShiftId, setTrocarPresetTargetShiftId] = useState(null);
  const [responding, setResponding] = useState(null); // offerId in flight
  const _btnStateRef = useRef({}); // rowKey → último estado do botão (pra log de transição)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await GroupScheduleService.getMultipleMonths({
          groups,
          monthKey,
          token,
          userSource: user?.source,
          currentUserId: userId,
        });
        await GroupScheduleService.enrichWithPendingOffers(result, userId);
        // Pass local OffersContext swaps as source-of-truth — immediate after proposeSwap,
        // independent of Firestore read latency or query/permission issues.
        const localSwaps = [...(swapsSent || []), ...(swapsReceived || [])];
        await GroupScheduleService.enrichWithPendingSwaps(result, userId, localSwaps);
        if (cancelled) return;
        const day = {};
        for (const g of groups) {
          const gid = String(g.id);
          day[gid] = result[gid]?.days?.[dateStr] || null;
        }
        setPerGroup(day);
      } catch (err) {
        Logger.warn(`[GroupDayTeamScreen] load: ${err?.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dateStr, monthKey, groups.map(g => g.id).join(','), token, user?.source, userId, reloadCounter,
      // Re-run when local swap/offer state changes so badges and buttons reflect the latest pending state.
      swapsSent.length, swapsReceived.length, offersSent.length, offersReceived.length]);

  const dateLabel = () => {
    const wd = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][selectedDate.getDay()];
    return `${wd}, ${selectedDate.getDate()} de ${MONTHS_FULL_PT[selectedDate.getMonth()]}`;
  };

  // ── Build a "shift-like" object from an assignment to feed Ceder/Trocar sheets ──
  const buildShiftFromAssignment = (assignment, slot, group, daySchedule) => ({
    id: assignment.shiftId,
    label: slot.label,
    time: slot.time,
    date: daySchedule.date,
    startISO: `${daySchedule.date}T00:00:00`,
    monthKey: daySchedule.date.slice(0, 7),
    group: {
      id: group.id,
      name: group.name,
      color: group.color,
      institution: group.institution,
    },
    userId: assignment.userId,
    source: assignment.source || 'webClient',
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const selfName = user?.name || user?.full_name || '';
  const handleCede = (assignment, slot, group, daySchedule) => {
    const sh = buildShiftFromAssignment(assignment, slot, group, daySchedule);
    ActivityLogger.cedeOpened(selfName, sh, 'picker');
    setCedeShift(sh);
  };

  const handleTrocar = (assignment, slot, group, daySchedule) => {
    const targetShift = slot && group && daySchedule
      ? buildShiftFromAssignment(assignment, slot, group, daySchedule)
      : null;
    ActivityLogger.trocarOpened(selfName, assignment.person?.name, targetShift);
    Logger.info(`[GroupDayTeam] Trocar tapped → target uid=${assignment.userId} name=${assignment.person?.name} shiftId=${assignment.shiftId}`);
    setTrocarPresetTargetUserId(String(assignment.userId));
    setTrocarPresetTargetShiftId(assignment.shiftId ? String(assignment.shiftId) : null);
    setTrocarShift(null);
    setTrocarVisible(true);
  };

  const handleAcceptOffer = async (assignment) => {
    const offer = assignment.pendingOffer?.offer;
    if (!offer) return;
    setResponding(offer.id);
    await acceptOffer(offer);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };

  const handleRejectOffer = async (assignment) => {
    const offer = assignment.pendingOffer?.offer;
    if (!offer) return;
    setResponding(offer.id);
    await rejectOffer(offer);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };

  const handleCancelOffer = async (assignment) => {
    const offer = assignment.pendingOffer?.offer;
    if (!offer) return;
    setResponding(offer.id);
    await cancelOffer(offer);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };

  // ── Swap responses ─────────────────────────────────────────────────────────
  const handleAcceptSwap = async (assignment) => {
    const swap = assignment.pendingSwap?.swap;
    if (!swap) return;
    setResponding(swap.id);
    await acceptSwap(swap);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };
  const handleRejectSwap = async (assignment) => {
    const swap = assignment.pendingSwap?.swap;
    if (!swap) return;
    setResponding(swap.id);
    await rejectSwap(swap);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };
  const handleCancelSwap = async (assignment) => {
    const swap = assignment.pendingSwap?.swap;
    if (!swap) return;
    setResponding(swap.id);
    await cancelSwap(swap);
    setResponding(null);
    setReloadCounter(c => c + 1);
  };

  const closeCede = () => { setCedeShift(null); setReloadCounter(c => c + 1); };
  const closeTrocar = () => {
    setTrocarVisible(false);
    setTrocarShift(null);
    setTrocarPresetTargetUserId(null);
    setTrocarPresetTargetShiftId(null);
    setReloadCounter(c => c + 1);
  };

  // ── Render row helpers ──────────────────────────────────────────────────────
  const renderAvatar = (person, fallbackBorder = C.background.card, accent = C.primary) => (
    <View style={[s.avatar, { borderColor: fallbackBorder }]}>
      {person?.photo
        ? <Image source={{ uri: person.photo }} style={s.avatarImg} />
        : <View style={[s.avatarFallback, { backgroundColor: accent + '14' }]}>
            <Text style={[s.avatarInitial, { color: accent }]}>
              {(person?.name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
      }
    </View>
  );

  const renderAssignmentRow = (assignment, slot, group, daySchedule, rowKey) => {
    const isMe = String(assignment.userId) === selfId;
    const pending = assignment.pendingOffer;
    const isPendingForMe = pending?.role === 'recipient';
    const isPendingFromMe = pending?.role === 'sender';
    const swap = assignment.pendingSwap;
    const swapRole = swap?.role || null; // initiator-mine | initiator-theirs | target-mine | target-theirs
    const isLoading = responding && (
      pending?.offerId === responding || swap?.swapId === responding
    );
    // Ceder/Trocar só fazem sentido para plantões aurora (pessoa existe na base).
    // WebClient ou ids não resolvidos → sem ação. Respostas a ofertas/trocas
    // pendentes continuam (já são transações aurora existentes).
    const canAct = assignment.source === 'aurora';
    // Defensive: council pode estar como objeto em caches antigos.
    const councilText = typeof assignment.person?.council === 'string'
      ? assignment.person.council
      : (assignment.person?.council?.state || assignment.person?.council?.uf || '');

    // Log button-state transitions for this row (only when it changes between renders)
    const buttonNow = (() => {
      if (isLoading) return 'loading';
      if (isPendingForMe) return 'aceitar/recusar (oferta)';
      if (isPendingFromMe) return 'cancelar (oferta)';
      if (swapRole === 'target-mine') return 'aceitar/recusar (troca)';
      if (swapRole === 'initiator-mine' || swapRole === 'initiator-theirs') return 'cancelar (troca)';
      if (swapRole === 'target-theirs') return '— ofereceram para você';
      if (isMe) return canAct ? 'ceder' : '—';
      return canAct ? 'trocar' : '—';
    })();
    const prevBtn = _btnStateRef.current[rowKey];
    if (prevBtn && prevBtn !== buttonNow) {
      ActivityLogger.buttonStateChange({
        selfName, rowName: assignment.person?.name || 'colega',
        before: prevBtn, after: buttonNow,
      });
    }
    _btnStateRef.current[rowKey] = buttonNow;

    return (
      <View key={rowKey} style={s.personRow}>
        {renderAvatar(assignment.person)}
        <View style={s.personInfo}>
          <Text style={s.personName} numberOfLines={1}>
            {assignment.person?.full_name || assignment.person?.name || '—'}
            {isMe ? <Text style={s.youTag}>  • você</Text> : null}
          </Text>
          {!!councilText && (
            <Text style={s.personMeta} numberOfLines={1}>{councilText}</Text>
          )}
          {isPendingForMe && (
            <Text style={[s.pendingLabel, { color: C.primary }]} numberOfLines={1}>
              Pendente para você
            </Text>
          )}
          {isPendingFromMe && (
            <Text style={s.pendingLabel} numberOfLines={1}>
              Aguardando {pending.counterpartyName || 'colega'}
            </Text>
          )}
          {swapRole === 'initiator-theirs' && (
            <Text style={s.pendingLabel} numberOfLines={1}>
              Troca aguardando {swap.counterpartyName || 'colega'}
            </Text>
          )}
          {swapRole === 'initiator-mine' && (
            <Text style={s.pendingLabel} numberOfLines={1}>
              Oferecido em troca
            </Text>
          )}
          {swapRole === 'target-mine' && (
            <Text style={[s.pendingLabel, { color: C.primary }]} numberOfLines={1}>
              {swap.counterpartyName || 'Colega'} quer trocar com você
            </Text>
          )}
          {swapRole === 'target-theirs' && (
            <Text style={s.pendingLabel} numberOfLines={1}>
              Ofereceram para você
            </Text>
          )}
        </View>
        <View style={s.actionsCol}>
          {isLoading && <ActivityIndicator size="small" color={C.primary} />}

          {/* Pending cede offer */}
          {!isLoading && isPendingForMe && (
            <>
              <Pressable style={[s.actionBtn, s.acceptBtn]} onPress={() => handleAcceptOffer(assignment)}>
                <Text style={[s.actionBtnText, { color: '#fff' }]}>Aceitar</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, s.neutralBtn]} onPress={() => handleRejectOffer(assignment)}>
                <Text style={[s.actionBtnText, { color: C.text.secondary }]}>Recusar</Text>
              </Pressable>
            </>
          )}
          {!isLoading && isPendingFromMe && (
            <Pressable style={[s.actionBtn, s.neutralBtn]} onPress={() => handleCancelOffer(assignment)}>
              <Text style={[s.actionBtnText, { color: C.text.secondary }]}>Cancelar</Text>
            </Pressable>
          )}

          {/* Pending swap */}
          {!isLoading && !pending && swapRole === 'target-mine' && (
            <>
              <Pressable style={[s.actionBtn, s.acceptBtn]} onPress={() => handleAcceptSwap(assignment)}>
                <Text style={[s.actionBtnText, { color: '#fff' }]}>Aceitar</Text>
              </Pressable>
              <Pressable style={[s.actionBtn, s.neutralBtn]} onPress={() => handleRejectSwap(assignment)}>
                <Text style={[s.actionBtnText, { color: C.text.secondary }]}>Recusar</Text>
              </Pressable>
            </>
          )}
          {!isLoading && !pending && (swapRole === 'initiator-mine' || swapRole === 'initiator-theirs') && (
            <Pressable style={[s.actionBtn, s.cancelBtn]} onPress={() => handleCancelSwap(assignment)}>
              <Text style={[s.actionBtnText, { color: C.error }]}>Cancelar</Text>
            </Pressable>
          )}

          {/* Default actions when nothing pending — só para plantões aurora */}
          {!isLoading && !pending && !swapRole && canAct && isMe && (
            <Pressable style={[s.actionBtn, s.cedeBtn]} onPress={() => handleCede(assignment, slot, group, daySchedule)}>
              <Text style={[s.actionBtnText, { color: C.primary }]}>Ceder</Text>
            </Pressable>
          )}
          {!isLoading && !pending && !swapRole && canAct && !isMe && (
            <Pressable style={[s.actionBtn, s.swapBtn]} onPress={() => handleTrocar(assignment, slot, group, daySchedule)}>
              <Text style={[s.actionBtnText, { color: C.text.secondary }]}>Trocar</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  // Vaga em aberto na escala do grupo. Não há "Pegar" aqui: vagas vindas do
  // webClient não são openings aurora claimáveis. Linha apenas informativa.
  const renderVacancyRow = (slot, group, idx) => (
    <View key={`v-${group.id}-${slot.label}-${idx}`} style={s.personRow}>
      <View style={[s.avatar, s.avatarVacant, { borderColor: C.warning }]}>
        <Ionicons name="add" size={16} color={C.warning} />
      </View>
      <View style={s.personInfo}>
        <Text style={[s.personName, { color: C.text.secondary }]} numberOfLines={1}>
          Vaga disponível
        </Text>
        <Text style={s.personMeta} numberOfLines={1}>Aberta no grupo</Text>
      </View>
    </View>
  );

  const renderTurnSection = (turn, groupColor, group, daySchedule) => {
    const badgeColor = SHIFT_TYPE_COLOR[turn.label] || groupColor;
    return (
      <View key={`${group.id}-${turn.label}`} style={s.turnBox}>
        <View style={s.turnHeader}>
          <View style={[s.turnBadge, { backgroundColor: badgeColor + '1f' }]}>
            <Text style={[s.turnBadgeText, { color: badgeColor }]}>
              {LABEL_NAME[turn.label] || turn.label}
            </Text>
          </View>
          {!!turn.time && <Text style={s.turnTime}>{turn.time}</Text>}
          {turn.available > 0 && (
            <View style={s.vacancyPill}>
              <Text style={s.vacancyPillText}>
                {turn.available} {turn.available === 1 ? 'vaga' : 'vagas'}
              </Text>
            </View>
          )}
        </View>

        <View style={s.peopleList}>
          {(turn.assignments || []).map((a, i) =>
            renderAssignmentRow(a, turn, group, daySchedule, `${group.id}-${turn.label}-${a.userId}-${i}`)
          )}
          {turn.available > 0 && Array.from({ length: turn.available }).map((_, i) =>
            renderVacancyRow(turn, group, i)
          )}
        </View>
      </View>
    );
  };

  const renderGroupSection = (group) => {
    const gid = String(group.id);
    const day = perGroup[gid];
    const groupColor = (group.color || '').startsWith('#') ? group.color : `#${group.color || '888888'}`;

    const orderedTurns = (day?.slots || [])
      .filter(t => (t.assignments?.length || 0) > 0 || (t.available || 0) > 0)
      .sort((a, b) => TURN_ORDER.indexOf(a.label) - TURN_ORDER.indexOf(b.label));

    return (
      <View key={gid} style={s.groupSection}>
        <View style={s.groupHeader}>
          <View style={[s.groupColorBar, { backgroundColor: groupColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.groupName} numberOfLines={1}>{group.name}</Text>
            {!!group.institution?.name && (
              <Text style={s.groupInstitution} numberOfLines={1}>{group.institution.name}</Text>
            )}
          </View>
        </View>

        {orderedTurns.length === 0 ? (
          <Text style={s.emptyTurns}>{loading ? 'Carregando…' : 'Sem plantões neste dia.'}</Text>
        ) : (
          orderedTurns.map(t => renderTurnSection(t, groupColor, group, day))
        )}
      </View>
    );
  };

  return (
    <>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: Spacing.xl }}>
        <View style={s.headerWrap}>
          <Text style={s.dateLabel}>{dateLabel()}</Text>
          <Text style={s.subLabel}>
            {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
          </Text>
        </View>

        {groups.length === 0 && (
          <Text style={s.emptyTurns}>Nenhum grupo selecionado.</Text>
        )}

        {groups.map(renderGroupSection)}
      </ScrollView>

      {cedeShift && (
        <CederFlowSheet visible shift={cedeShift} onClose={closeCede} />
      )}
      {trocarVisible && (
        <TrocarFlowSheet
          visible
          shift={trocarShift}
          presetTargetUserId={trocarPresetTargetUserId}
          presetTargetShiftId={trocarPresetTargetShiftId}
          onClose={closeTrocar}
        />
      )}
    </>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.primary,
  },
  headerWrap: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dateLabel: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.display,
    color: C.text.primary,
    letterSpacing: -0.4,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  groupSection: {
    paddingHorizontal: Spacing.screen,
    marginBottom: Spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  groupColorBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  groupName: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.primary,
  },
  groupInstitution: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  emptyTurns: {
    paddingHorizontal: Spacing.screen,
    paddingVertical: 12,
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  turnBox: {
    backgroundColor: C.background.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: C.border.light,
    marginBottom: 10,
    ...Shadows.small,
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  turnBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  turnBadgeText: {
    fontSize: 10.5,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  turnTime: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.secondary,
  },
  vacancyPill: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.warning + '1f',
  },
  vacancyPillText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: C.warning,
    letterSpacing: 0.4,
  },
  peopleList: {
    gap: 10,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarVacant: {
    borderStyle: 'dashed',
    backgroundColor: C.warning + '14',
  },
  avatarImg: {
    width: 36,
    height: 36,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 13.5,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.primary,
  },
  youTag: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  personMeta: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    marginTop: 1,
  },
  pendingLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.tertiary,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  actionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    letterSpacing: 0.3,
  },
  cedeBtn: {
    backgroundColor: C.primary + '18',
  },
  swapBtn: {
    backgroundColor: C.background.secondary,
    borderWidth: 0.5,
    borderColor: C.border.light,
  },
  acceptBtn: {
    backgroundColor: C.primary,
  },
  neutralBtn: {
    backgroundColor: C.background.secondary,
    borderWidth: 0.5,
    borderColor: C.border.light,
  },
  cancelBtn: {
    backgroundColor: C.error + '14',
    borderWidth: 0.5,
    borderColor: C.error + '40',
  },
});

export default GroupDayTeamScreen;
