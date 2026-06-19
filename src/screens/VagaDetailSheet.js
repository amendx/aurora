/**
 * VagaDetailSheet — detalhe de uma vaga.
 *
 * Layout (design: DETALHES DA VAGA):
 *   - banner "no seu plantão" (só falta gente)
 *   - card do plantão: day chip + turno + horário + grupo
 *   - card Hospital / Cedido por / Faltam
 *   - card "Quem já está escalado": stack de avatares + vagas em aberto + resumo
 *   - card "Composição do valor": horas × R$/h, fidelização/bônus, total
 *
 * Dois tipos de vaga (mesmo layout, CTA diferente):
 *   - falta   → "Chamar colega" (sugere a um colega)
 *   - cede    → "Pegar plantão" (primeiro a pegar leva)
 */

import { useState, useEffect, useContext, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, Image,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { isViewOnly } from '../utils/userSource';
import { useGroups } from '../contexts/GroupsContext';
import GroupScheduleService from '../services/GroupScheduleService';
import { calculateShiftValueWithBreakdown } from '../utils/ShiftValueCalculator';
import Logger from '../utils/Logger';

const SHIFT_COLORS = (C) => ({ M: C.primary, T: C.warning, N: C.info, D: C.info });
const SHIFT_NAMES = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const WEEKDAY_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WK_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const fmtTime = (d) => d?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '';
const fmtFullDate = (d) =>
  d ? `${WEEKDAY_PT[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]}` : '';
const fmtBRL = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const _initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export default function VagaDetailSheet({ visible, opening, onClose, onClaim, mode = 'claim', onChamar }) {
  const isFalta = mode === 'falta';
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { user, token } = useContext(AuthContext);
  const { groupsById } = useGroups();

  const [team, setTeam] = useState(null);   // assignments[] | null = loading
  const [claiming, setClaiming] = useState(false);
  const [valueBreakdown, setValueBreakdown] = useState(null);

  const startDate = opening?.startISO ? new Date(opening.startISO) : null;
  const endDate = opening?.endISO ? new Date(opening.endISO) : null;
  const labelKey = String(opening?.label || '').charAt(0).toUpperCase();
  const shiftColor = SHIFT_COLORS(C)[labelKey] || C.primary;
  const shiftName = SHIFT_NAMES[labelKey] || opening?.label || 'Plantão';
  const hours = opening?.durationMinutes ? Math.round(opening.durationMinutes / 60) : null;
  const slotsLeft = opening?.availableSlots || 0;
  const firstSlotId = opening?.slots?.[0]?.slotId;
  const groupName = opening?.group?.name || '—';
  const institution = opening?.group?.institution?.name || '';
  // Quem passou/abriu o plantão: cessão de colega → nome do médico; vaga aberta
  // pela coordenação (admin) → "Coordenação da escala"; falta gente → é o seu plantão.
  const isAdminVaga = opening?.kind === 'admin_temp' || opening?.kind === 'admin_fixed'
    || (opening?.createdByRole && opening.createdByRole !== 'doctor');
  const passedByLabel = isFalta ? 'Plantão' : (isAdminVaga ? 'Aberto por' : 'Cedido por');
  const passedByName = isFalta ? 'Você' : (opening?.originUserName || (isAdminVaga ? 'Coordenação da escala' : 'Colega'));
  const gc = opening?.group?.color
    ? (String(opening.group.color).startsWith('#') ? opening.group.color : `#${opening.group.color}`)
    : shiftColor;
  const selfId = String(user?.id || '');
  const subtitle = isFalta ? 'no seu plantão' : 'aberta ao grupo';

  // Resolve full group from context (members/source), fallback to opening snapshot.
  const group = useMemo(() => {
    const gid = opening?.group?.id ? String(opening.group.id) : null;
    if (!gid) return opening?.group || null;
    if (groupsById?.[gid]) return groupsById[gid];
    const found = Object.values(groupsById || {}).find(
      g => String(g.id) === gid || String(g.public_id) === gid
    );
    return found || opening?.group || null;
  }, [opening?.group, groupsById]);

  // Carrega quem já está escalado neste turno.
  useEffect(() => {
    if (!visible || !opening) { setTeam(null); return; }
    let cancelled = false;
    setTeam(null);
    (async () => {
      try {
        const dateStr = opening.dateKey || (opening.startISO || '').slice(0, 10);
        const monthKey = opening.monthKey || (opening.startISO || '').slice(0, 7);
        if (!group?.id || !dateStr) { if (!cancelled) setTeam([]); return; }
        const res = await GroupScheduleService.getMonth({
          group, monthKey, token,
          userSource: user?.source,
          auroraOnlyMode: user?.auroraOnlyMode === true,
          currentUserId: user?.id,
        });
        const day = res?.days?.[dateStr];
        const slot = (day?.slots || []).find(
          sl => String(sl.label).charAt(0).toUpperCase() === labelKey
        ) || (day?.slots || [])[0];
        if (!cancelled) setTeam(slot?.assignments || []);
      } catch (err) {
        Logger.warn(`[VagaDetailSheet] load team: ${err?.message}`);
        if (!cancelled) setTeam([]);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, opening?.id, group?.id, labelKey, token, user?.source, user?.id]);

  // Composição do valor (ShiftValueCalculator). Sempre retorna fallback.
  useEffect(() => {
    if (!visible || !opening) { setValueBreakdown(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const dateStr = opening.dateKey || (opening.startISO || '').slice(0, 10);
        const bd = await calculateShiftValueWithBreakdown(
          { label: opening.label, group: opening.group }, dateStr,
        );
        if (!cancelled) setValueBreakdown(bd);
      } catch (err) {
        Logger.warn(`[VagaDetailSheet] value: ${err?.message}`);
        if (!cancelled) setValueBreakdown(null);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, opening?.id]);

  const handleClaim = () => {
    Alert.alert(
      'Pegar este plantão?',
      `${shiftName} · ${fmtFullDate(startDate)}\n${groupName}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pegar plantão',
          onPress: async () => {
            setClaiming(true);
            const r = await onClaim?.(opening.id, firstSlotId);
            setClaiming(false);
            if (r?.success) onClose?.();
            else Alert.alert('Erro', 'Não foi possível assumir a vaga. Tente novamente.');
          },
        },
      ],
    );
  };

  if (!visible || !opening) return null;

  const includesMe = (team || []).some(a => String(a.userId) === selfId);
  const others = (team || []).length - (includesMe ? 1 : 0);
  const teamSummary = includesMe
    ? `Você${others > 0 ? ` e ${others} ${others === 1 ? 'colega' : 'colegas'}` : ''} · ${slotsLeft} em aberto`
    : `${(team || []).length} ${(team || []).length === 1 ? 'escalado' : 'escalados'} · ${slotsLeft} em aberto`;

  // ── helpers ───────────────────────────────────────────────────────────────
  const renderInfoRow = (icon, label, value, valueColor) => (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={16} color={C.text.tertiary} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor && { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );

  const renderStack = () => {
    const shown = (team || []).slice(0, 4);
    const openShown = Math.min(slotsLeft, 3);
    return (
      <View style={s.stackRow}>
        {shown.map((a, i) => (
          <View key={`a-${i}`} style={[s.stackAvatar, { marginLeft: i === 0 ? 0 : -10 }]}>
            {a.person?.photo
              ? <Image source={{ uri: a.person.photo }} style={s.stackImg} />
              : <View style={[s.stackImg, s.stackFallback]}>
                  <Text style={s.stackInitials}>{_initials(a.person?.name)}</Text>
                </View>}
          </View>
        ))}
        {Array.from({ length: openShown }).map((_, i) => (
          <View key={`o-${i}`} style={[s.stackAvatar, s.stackOpen, { marginLeft: (shown.length === 0 && i === 0) ? 0 : -10 }]}>
            <Ionicons name="add" size={14} color={C.warning} />
          </View>
        ))}
      </View>
    );
  };

  const vb = valueBreakdown;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>Detalhe da vaga</Text>
            <Text style={s.subtitle}>{subtitle}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={C.text.secondary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ maxHeight: 480 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Banner "no seu plantão" (falta gente) */}
          {isFalta && (
            <View style={[s.faltaBanner, { backgroundColor: C.warning + '12', borderColor: C.warning + '33' }]}>
              <Ionicons name="sparkles-outline" size={16} color={C.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[s.faltaBannerTitle, { color: C.warning }]}>Você está escalada neste plantão</Text>
                <Text style={[s.faltaBannerSub, { color: C.warning }]}>
                  Falta {slotsLeft} {slotsLeft === 1 ? 'colega' : 'colegas'} no seu time.
                </Text>
              </View>
            </View>
          )}

          {/* Card do plantão — day chip + turno */}
          <View style={s.card}>
            <View style={s.shiftHeadRow}>
              <View style={s.dayCol}>
                <Text style={s.dayNum}>{startDate ? String(startDate.getDate()).padStart(2, '0') : ''}</Text>
                <Text style={s.dayWk}>
                  {startDate ? `${WK_SHORT[startDate.getDay()]} · ${MONTHS_PT[startDate.getMonth()]}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.shiftLine}>
                  <View style={[s.shiftBadge, { backgroundColor: shiftColor + '1f' }]}>
                    <Text style={[s.shiftBadgeText, { color: shiftColor }]}>{shiftName}</Text>
                  </View>
                  <Text style={s.shiftTime}>
                    {startDate ? fmtTime(startDate) : ''}{endDate ? '–' + fmtTime(endDate) : ''}
                  </Text>
                  {hours != null && <Text style={s.shiftHours}>· {hours}h</Text>}
                </View>
                <View style={s.groupChipRow}>
                  <View style={[s.groupDot, { backgroundColor: gc }]} />
                  <Text style={s.groupChipText} numberOfLines={1}>{groupName}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card Hospital / Cedido por / Faltam */}
          <View style={s.card}>
            {renderInfoRow('business-outline', 'Hospital', institution || '—')}
            <View style={s.infoDivider} />
            {renderInfoRow('person-outline', passedByLabel, passedByName)}
            <View style={s.infoDivider} />
            {renderInfoRow(
              'people-outline',
              isFalta ? 'Faltam' : 'Vagas',
              `${slotsLeft} ${slotsLeft === 1 ? 'vaga' : 'vagas'}`,
              isFalta ? C.warning : undefined,
            )}
          </View>

          {/* Quem já está escalado */}
          <View style={s.card}>
            <Text style={s.cardEyebrow}>Quem já está escalado</Text>
            {team === null ? (
              <ActivityIndicator size="small" color={C.primary} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <View style={s.escaladoRow}>
                {renderStack()}
                <Text style={s.escaladoSummary} numberOfLines={2}>{teamSummary}</Text>
              </View>
            )}
          </View>

          {/* Composição do valor */}
          {vb && (
            <View style={s.card}>
              <Text style={s.cardEyebrow}>Composição do valor</Text>
              <View style={s.valRow}>
                <Text style={s.valLabel}>{vb.hours}h × {fmtBRL(vb.hourlyValue)}</Text>
                <Text style={s.valAmount}>{fmtBRL(vb.baseValue)}</Text>
              </View>
              {vb.loyaltyBonus > 0 && (
                <View style={s.valRow}>
                  <Text style={s.valLabel}>Fidelização +{vb.loyaltyPercentage}%</Text>
                  <Text style={s.valAmount}>+ {fmtBRL(vb.loyaltyBonus)}</Text>
                </View>
              )}
              {vb.generalBonus > 0 && (
                <View style={s.valRow}>
                  <Text style={s.valLabel}>Bônus +{vb.generalBonusPercentage}%</Text>
                  <Text style={s.valAmount}>+ {fmtBRL(vb.generalBonus)}</Text>
                </View>
              )}
              <View style={s.valDivider} />
              <View style={s.valRow}>
                <Text style={s.valTotalLabel}>Total previsto</Text>
                <Text style={[s.valTotal, { color: C.money }]}>{fmtBRL(vb.finalValue)}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* CTA — conta só-visualização (PlantãoAPI) só fecha, não pega/chama */}
        <View style={s.ctaRow}>
          <Pressable style={[s.secondaryBtn, isViewOnly(user) && { flex: 1 }]} onPress={onClose}>
            <Text style={[s.secondaryBtnText, { color: C.text.secondary }]}>Fechar</Text>
          </Pressable>
          {isViewOnly(user) ? null : isFalta ? (
            <Pressable
              style={[s.primaryBtn, { backgroundColor: C.primary, flex: 2 }]}
              onPress={() => { onChamar?.(opening); onClose?.(); }}
            >
              <Ionicons name="person-add-outline" size={16} color="#fff" />
              <Text style={s.primaryBtnText}>Chamar colega</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[s.primaryBtn, { backgroundColor: slotsLeft > 0 ? C.primary : C.border.medium, flex: 2 }]}
              onPress={handleClaim}
              disabled={claiming || slotsLeft <= 0}
            >
              {claiming
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>Pegar plantão</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.background.secondary,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },
  subtitle: { fontSize: 12.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, marginTop: 1 },

  faltaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14,
    borderWidth: 0.5, marginBottom: 12,
  },
  faltaBannerTitle: { fontSize: 13.5, fontFamily: Typography.fontFamily.bold },
  faltaBannerSub: { fontSize: 12, fontFamily: Typography.fontFamily.regular, marginTop: 1, opacity: 0.9 },

  // Card branco genérico
  card: {
    backgroundColor: C.background.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    padding: 14, marginBottom: 10,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.text.tertiary, marginBottom: 12 },

  // Plantão
  shiftHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dayCol: { width: 48, alignItems: 'center' },
  dayNum: { fontSize: 30, fontFamily: Typography.fontFamily.bold, lineHeight: 34, color: C.text.primary },
  dayWk: { fontSize: 10.5, fontFamily: Typography.fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.4, color: C.text.tertiary, marginTop: 1 },
  shiftLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  shiftBadgeText: { fontSize: 11, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  shiftTime: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  shiftHours: { fontSize: 12.5, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary },
  groupChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupChipText: { fontSize: 12.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary, flex: 1 },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  infoLabel: { fontSize: 13, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 13.5, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  infoDivider: { height: 0.5, backgroundColor: C.border.light },

  // Escalados
  escaladoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stackRow: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.background.card, overflow: 'hidden',
  },
  stackImg: { width: 30, height: 30, borderRadius: 15 },
  stackFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  stackInitials: { color: '#fff', fontSize: 11, fontFamily: Typography.fontFamily.bold },
  stackOpen: { backgroundColor: C.warning + '14', borderStyle: 'dashed', borderColor: C.warning + '88' },
  escaladoSummary: { flex: 1, fontSize: 12.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },

  // Composição do valor
  valRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
  valLabel: { fontSize: 13, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  valAmount: { fontSize: 13.5, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  valDivider: { height: 0.5, backgroundColor: C.border.light, marginVertical: 8 },
  valTotalLabel: { fontSize: 14, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  valTotal: { fontSize: 16, fontFamily: Typography.fontFamily.bold },

  // CTA
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 18 },
  secondaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: C.background.card, borderWidth: 0.5, borderColor: C.border.light },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: { flexDirection: 'row', gap: 6, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
