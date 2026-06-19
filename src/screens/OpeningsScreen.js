/**
 * OpeningsScreen — "Vagas" (design: A / Por equipe)
 *
 * Layout:
 *   1. Filter chips por grupo (Tudo + cada grupo) — pill row horizontal.
 *   2. "No seu plantão · falta gente" — meus plantões com time incompleto.
 *   3. "Minhas cessões abertas" — minhas cessões pendentes com Cancelar inline.
 *   4. Banner "Plantões abertos pela coordenação da escala".
 *   5. Seções por equipe (dot + nome + N vagas) com cards.
 *
 * Card: dia (accent da cor do grupo) | turno + horário | pill "N vagas" + R$ valor.
 */

import { useEffect, useState, useCallback, useMemo, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useGroups } from '../contexts/GroupsContext';
import GroupScheduleService from '../services/GroupScheduleService';
import { getFullShiftConfig, calculateShiftFinalValueSync } from '../utils/ShiftValueCalculator';
import Logger from '../utils/Logger';
import VagaDetailSheet from './VagaDetailSheet';
import CederFlowSheet from './CederFlowSheet';

const SHIFT_NAMES  = { M: 'Manhã', T: 'Tarde', N: 'Noite', D: 'Noite' };
const WEEKDAY_PT   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LABEL_DURATIONS = { M: 360, T: 360, N: 720, D: 720 };

const fmtTime = (d) => d?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '';
const fmtDay  = (d) => WEEKDAY_PT[d?.getDay?.()] || '';
const fmtDayNum = (d) => d ? String(d.getDate()).padStart(2, '0') : '';

// Extrai "HH:MM" inicial/final de uma string de turno tipo "19h00 às 07h00".
const parseSlotTimes = (raw) => {
  if (!raw) return { start: null, end: null };
  const m = String(raw).match(/(\d{1,2})h(\d{2}).*?(\d{1,2})h(\d{2})/);
  if (!m) return { start: null, end: null };
  return { start: `${m[1].padStart(2, '0')}:${m[2]}`, end: `${m[3].padStart(2, '0')}:${m[4]}` };
};

// Constrói um "shift-like" / opening-like a partir de um item de falta gente.
const faltaToShift = (item) => {
  const { start, end } = parseSlotTimes(item.time || item.labelRaw);
  const startISO = start ? `${item.date}T${start}:00` : `${item.date}T00:00:00`;
  // Noite cruza meia-noite → fim no dia seguinte.
  let endISO = null;
  if (end) {
    const crosses = start && end < start;
    const endDate = crosses ? _addDays(item.date, 1) : item.date;
    endISO = `${endDate}T${end}:00`;
  }
  const durationMinutes = LABEL_DURATIONS[item.label] ?? 360;
  return { startISO, endISO, durationMinutes };
};

const _addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const _monthKeysBetween = (a, b) => {
  const out = new Set();
  const d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b) {
    out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return [...out];
};

const fmtBRL = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normalizeColor = (c, fb) => c ? (String(c).startsWith('#') ? c : `#${c}`) : fb;

// Valor estimado (base + fidelização + bônus) — síncrono, com config pré-carregada.
const computeValue = (item, valueCfg) => {
  const dateStr = item.dateKey || item.date || (item.startISO || '').slice(0, 10);
  if (!dateStr || !item.label) return null;
  const v = calculateShiftFinalValueSync({ label: item.label, group: item.group }, dateStr, valueCfg);
  return Number.isFinite(v) ? v : null;
};

// ── Linha de plantão (vaga ou falta) ─────────────────────────────────────────
// Toque abre o detalhe (VagaDetailSheet). Layout: dia | turno+horário | vagas+valor.
function CardRow({ weekday, dayNum, accent, shiftName, timeText, slots, value, teamLabel, fixa, directed, amber, onPress, C, s }) {
  return (
    <Pressable onPress={onPress} style={[s.card, amber && { borderColor: C.warning + '55' }]}>
      <View style={s.cardDayCol}>
        <View style={[s.cardAccent, { backgroundColor: accent }]} />
        <Text style={s.cardWk}>{weekday}</Text>
        <Text style={s.cardDayNum}>{dayNum}</Text>
      </View>
      <View style={s.cardMid}>
        <View style={s.cardShiftLine}>
          <Text style={s.cardShiftName} numberOfLines={1}>{shiftName}</Text>
          {fixa && (
            <View style={[s.cardTeamChip, { backgroundColor: C.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <Ionicons name="repeat" size={10} color={C.primary} />
              <Text style={[s.cardTeamChipText, { color: C.primary }]}>Escala fixa</Text>
            </View>
          )}
          {directed && (
            <View style={[s.cardTeamChip, { backgroundColor: C.accentSoft }]}>
              <Text style={[s.cardTeamChipText, { color: C.primary }]}>Para você</Text>
            </View>
          )}
          {!!teamLabel && (
            <View style={[s.cardTeamChip, { backgroundColor: accent + '1A' }]}>
              <Text style={[s.cardTeamChipText, { color: accent }]} numberOfLines={1}>{teamLabel}</Text>
            </View>
          )}
        </View>
        {!!timeText && <Text style={s.cardTime}>{timeText}</Text>}
      </View>
      <View style={s.cardRight}>
        <View style={s.cardVagaPill}>
          <Ionicons name="people-outline" size={11} color={C.primary} />
          <Text style={s.cardVagaText}>{slots} {slots === 1 ? 'vaga' : 'vagas'}</Text>
        </View>
        <View style={s.cardValueRow}>
          {value != null && <Text style={s.cardValue}>{fmtBRL(value)}</Text>}
          <Ionicons name="chevron-forward" size={14} color={C.text.tertiary} />
        </View>
      </View>
    </Pressable>
  );
}

function VagaCard({ item, onPress, valueCfg, C, s }) {
  const startDate = item.startISO ? new Date(item.startISO) : null;
  const endDate   = item.endISO   ? new Date(item.endISO)   : null;
  const labelKey  = String(item.label || '').charAt(0).toUpperCase();
  const shiftName  = SHIFT_NAMES[labelKey] || item.label || 'Plantão';
  const hours = item.durationMinutes ? Math.round(item.durationMinutes / 60) : null;
  const timeText = startDate
    ? `${fmtTime(startDate)}${endDate ? ' – ' + fmtTime(endDate) : ''}${hours != null ? ' · ' + hours + 'h' : ''}`
    : '';
  return (
    <CardRow
      weekday={fmtDay(startDate)}
      dayNum={fmtDayNum(startDate)}
      accent={normalizeColor(item.group?.color, C.primary)}
      shiftName={shiftName}
      timeText={timeText}
      slots={item.availableSlots || 0}
      value={computeValue(item, valueCfg)}
      fixa={item.kind === 'admin_fixed'}
      directed={!!item.targetUserId}
      onPress={() => onPress(item)}
      C={C} s={s}
    />
  );
}

// ── Card de cessão que EU abri (aguardando colega pegar) ─────────────────────
function MyCedeCard({ item, onCancel, C, s }) {
  const snap = item?.originShiftSnapshot || {};
  const startISO = snap.startISO || item.startISO;
  const endISO = snap.endISO || item.endISO;
  const startDate = startISO ? new Date(startISO) : null;
  const endDate = endISO ? new Date(endISO) : null;
  const labelKey = String(snap.label || item.label || '').charAt(0).toUpperCase();
  const shiftName = SHIFT_NAMES[labelKey] || snap.label || item.label || 'Plantão';
  const groupName = snap.group?.name || item.group?.name || '—';

  return (
    <View style={[s.myCedeCard, { borderColor: C.warning + '40', backgroundColor: C.warning + '08' }]}>
      <View style={s.myCedeHead}>
        <View style={[s.myCedeIcon, { backgroundColor: C.warning + '22' }]}>
          <Ionicons name="megaphone" size={14} color={C.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.myCedeTitle, { color: C.text.primary }]} numberOfLines={1}>
            {shiftName} · {fmtDay(startDate)} {fmtDayNum(startDate)}
          </Text>
          <Text style={[s.myCedeSub, { color: C.text.tertiary }]} numberOfLines={1}>
            {groupName} · aguardando colega
          </Text>
        </View>
        {startDate && (
          <Text style={[s.myCedeTime, { color: C.text.tertiary }]}>
            {fmtTime(startDate)}{endDate ? '–' + fmtTime(endDate) : ''}
          </Text>
        )}
      </View>
      <Pressable onPress={onCancel} style={[s.myCedeCancel, { borderColor: C.warning + '55' }]}>
        <Text style={[s.myCedeCancelText, { color: C.warning }]}>Cancelar cessão</Text>
      </Pressable>
    </View>
  );
}

// ── Card "Falta gente com você" (plantão seu, time incompleto) ───────────────
function FaltaCard({ item, onPress, valueCfg, C, s }) {
  const { start, end } = parseSlotTimes(item.time || item.labelRaw);
  const startDate = new Date(`${item.date}T00:00:00`);
  const labelKey = String(item.label || '').charAt(0).toUpperCase();
  const shiftName = SHIFT_NAMES[labelKey] || item.label || 'Plantão';
  const hours = Math.round((LABEL_DURATIONS[labelKey] ?? 360) / 60);
  const timeText = (start && end) ? `${start} – ${end} · ${hours}h` : `${hours}h`;
  return (
    <CardRow
      weekday={fmtDay(startDate)}
      dayNum={fmtDayNum(startDate)}
      accent={normalizeColor(item.group?.color, C.warning)}
      shiftName={shiftName}
      timeText={timeText}
      teamLabel={item.group?.name || ''}
      slots={item.available || 0}
      value={computeValue(item, valueCfg)}
      amber
      onPress={() => onPress(item)}
      C={C} s={s}
    />
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────
export default function OpeningsScreen() {
  const C = useColors();
  const s = makeStyles(C);
  const {
    openings, myCededOpenings, loading, error, refresh,
    claimOpening, cancelCedeOpening,
  } = useOpenings();
  const { addClaimedShiftLocally, restoreShiftLocally } = useShifts();
  const { groups: ctxGroups } = useGroups();
  const { user, token } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);
  const [filterGroupKey, setFilterGroupKey] = useState(null); // null = Tudo; senão = nome do grupo
  const [detailVaga, setDetailVaga] = useState(null);   // vaga "por equipe" no sheet
  const [faltaGente, setFaltaGente] = useState([]);     // plantões meus c/ time incompleto
  const [faltaDetail, setFaltaDetail] = useState(null); // opening-like p/ detalhe falta
  const [chamarShift, setChamarShift] = useState(null); // shift p/ sugerir a um colega
  const [valueCfg, setValueCfg] = useState(null);       // config de valores p/ estimativa

  const selfId = String(user?.id || '');

  useEffect(() => { refresh(true); }, [refresh]);
  useEffect(() => { getFullShiftConfig().then(setValueCfg).catch(() => setValueCfg(null)); }, []);

  // Carrega "Falta gente com você": meus plantões nos próximos 7 dias cujo turno
  // tem vaga em aberto no grupo (eu escalada + slot.available > 0).
  useEffect(() => {
    if (!ctxGroups?.length || !user?.id) { setFaltaGente([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limit = new Date(today); limit.setDate(limit.getDate() + 7);
        const out = [];
        for (const mk of _monthKeysBetween(today, limit)) {
          const res = await GroupScheduleService.getMultipleMonths({
            groups: ctxGroups, monthKey: mk, token,
            userSource: user?.source, auroraOnlyMode: user?.auroraOnlyMode === true,
            currentUserId: user?.id,
          });
          for (const g of ctxGroups) {
            const days = res[String(g.id)]?.days || {};
            for (const [date, day] of Object.entries(days)) {
              const d = new Date(`${date}T00:00:00`);
              if (d < today || d > limit) continue;
              for (const slot of (day?.slots || [])) {
                const mine = (slot.assignments || []).some(a => String(a.userId) === selfId);
                if (mine && (slot.available || 0) > 0) {
                  out.push({
                    key: `${g.id}-${date}-${slot.label}`,
                    group: g, date, label: slot.label,
                    time: slot.time, labelRaw: slot.labelRaw,
                    available: slot.available, assignments: slot.assignments || [],
                  });
                }
              }
            }
          }
        }
        out.sort((a, b) => `${a.date}${a.label}`.localeCompare(`${b.date}${b.label}`));
        if (!cancelled) setFaltaGente(out);
      } catch (err) {
        Logger.warn(`[OpeningsScreen] falta gente: ${err?.message}`);
        if (!cancelled) setFaltaGente([]);
      }
    })();
    return () => { cancelled = true; };
  }, [ctxGroups, token, user?.id, user?.source, refreshing]);

  // "Chamar": sugere o plantão (vaga em aberto) a um colega → vira cessão
  // direcionada nas movimentações dele.
  const handleChamar = useCallback((item) => {
    const { startISO, endISO, durationMinutes } = faltaToShift(item);
    setChamarShift({
      id: `vaga_${item.group?.id}_${item.date}_${item.label}`,
      label: item.label,
      date: item.date,
      startISO, endISO,
      monthKey: item.date.slice(0, 7),
      durationMinutes,
      group: item.group,
    });
  }, []);

  const openFaltaDetail = useCallback((item) => {
    const { startISO, endISO, durationMinutes } = faltaToShift(item);
    setFaltaDetail({
      id: item.key,
      kind: 'falta',
      label: item.label,
      dateKey: item.date,
      monthKey: item.date.slice(0, 7),
      startISO, endISO, durationMinutes,
      availableSlots: item.available,
      group: item.group,
    });
  }, []);

  const handleClaim = useCallback(async (openingId, slotId) => {
    const r = await claimOpening(openingId, slotId);
    if (r?.success && r?.claimedShift) {
      await addClaimedShiftLocally?.(r.claimedShift);
    }
    return r;
  }, [claimOpening, addClaimedShiftLocally]);

  const handleCancelMyCede = useCallback((opening) => {
    Alert.alert(
      'Cancelar cessão?',
      `${opening?.group?.name || 'Plantão'} volta pra você.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar cessão',
          style: 'destructive',
          onPress: async () => {
            const r = await cancelCedeOpening(opening.id);
            if (r?.success && r?.restoredShift) {
              await restoreShiftLocally?.(r.restoredShift);
            }
          },
        },
      ],
    );
  }, [cancelCedeOpening, restoreShiftLocally]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh(true);
    setRefreshing(false);
  }, [refresh]);

  const vacancies = (openings || []).filter(o => (o.availableSlots || 0) > 0);
  const myActive  = (myCededOpenings || []).filter(o => o.status === 'active' || !o.status);

  // Universo de grupos: meus grupos (sempre, mesmo com 0 vagas) + grupos vistos
  // em vagas/cessões. Key = nome (estável entre contexto e openings, cujos ids
  // divergem — public_id vs id). Pills nunca somem ao zerar as vagas.
  const groupChips = useMemo(() => {
    const map = new Map();
    const add = (g) => {
      if (!g?.name || map.has(g.name)) return;
      map.set(g.name, { key: g.name, name: g.name, color: g.color || C.primary });
    };
    (ctxGroups || []).forEach(add);
    [...vacancies, ...myActive].forEach(o => add(o.group));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [ctxGroups, vacancies, myActive, C.primary]);

  const visibleVacancies = filterGroupKey
    ? vacancies.filter(o => o.group?.name === filterGroupKey)
    : vacancies;

  // Agrupar por equipe — uma seção por grupo do universo (inclui 0 vagas).
  const byGroup = useMemo(() => {
    const chips = filterGroupKey ? groupChips.filter(g => g.key === filterGroupKey) : groupChips;
    return chips.map(g => ({
      ...g,
      items: visibleVacancies
        .filter(o => o.group?.name === g.name)
        .sort((a, b) => (a.startISO || '').localeCompare(b.startISO || '')),
    }));
  }, [groupChips, visibleVacancies, filterGroupKey]);

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {loading && !refreshing ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={C.text.tertiary} />
          <Text style={[s.errorText, { color: C.text.tertiary }]}>{error}</Text>
          <Pressable onPress={() => refresh(true)} style={[s.retryBtn, { borderColor: C.primary }]}>
            <Text style={[s.retryText, { color: C.primary }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Filter chips no topo (não-scrollam com o conteúdo) */}
          {groupChips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
              style={s.chipsScroll}
            >
              <Pressable
                onPress={() => setFilterGroupKey(null)}
                style={[s.chip, !filterGroupKey && { backgroundColor: C.primary, borderColor: C.primary }]}
              >
                <Text style={[s.chipText, { color: !filterGroupKey ? '#fff' : C.text.secondary }]}>Tudo</Text>
              </Pressable>
              {groupChips.map(g => {
                const active = filterGroupKey === g.key;
                const gc = String(g.color).startsWith('#') ? g.color : `#${g.color}`;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setFilterGroupKey(active ? null : g.key)}
                    style={[s.chip, active && { borderColor: gc, backgroundColor: gc + '14' }]}
                  >
                    <View style={[s.chipDot, { backgroundColor: gc }]} />
                    <Text style={[s.chipText, { color: active ? gc : C.text.secondary }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: Spacing.lg, paddingTop: Spacing.sm }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          >
            <Text style={s.caption}>próximos 7 dias · seus grupos</Text>

            {faltaGente.length > 0 && (
              <>
                <View style={s.sectionHead}>
                  <View style={[s.sectionDot, { backgroundColor: C.warning }]} />
                  <Text style={s.sectionName}>No seu plantão · falta gente</Text>
                </View>
                {faltaGente.map(item => (
                  <FaltaCard
                    key={item.key}
                    item={item}
                    onPress={openFaltaDetail}
                    valueCfg={valueCfg}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {myActive.length > 0 && (
              <>
                <Text style={[s.sectionLabel, faltaGente.length > 0 && { marginTop: Spacing.lg }]}>Minhas cessões abertas</Text>
                {myActive.map(item => (
                  <MyCedeCard
                    key={item.id}
                    item={item}
                    onCancel={() => handleCancelMyCede(item)}
                    C={C}
                    s={s}
                  />
                ))}
              </>
            )}

            {/* Sem nenhuma vaga em lugar nenhum: card branco, mas o header (chips
                + cessões) permanece. Com vagas: lista por equipe. */}
            {vacancies.length === 0 ? (
              <View style={[
                s.empty,
                { backgroundColor: C.background.elevated, borderColor: C.border.light },
                myActive.length > 0 && { marginTop: Spacing.lg },
              ]}>
                <Ionicons name="calendar-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
                <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhuma vaga disponível</Text>
              </View>
            ) : (
              <>
                <View style={[s.coordBanner, { marginTop: (myActive.length > 0 || faltaGente.length > 0) ? Spacing.lg : 0 }]}>
                  <View style={s.coordIcon}>
                    <Ionicons name="megaphone-outline" size={14} color={C.primary} />
                  </View>
                  <Text style={s.coordText}>
                    Plantões abertos pela <Text style={s.coordBold}>coordenação da escala</Text> · pegue para preencher.
                  </Text>
                </View>
                {byGroup.map(g => {
                  const gc = String(g.color).startsWith('#') ? g.color : `#${g.color}`;
                  const totalVagas = g.items.reduce((acc, o) => acc + (o.availableSlots || 0), 0);
                  return (
                    <View key={g.key} style={s.groupSection}>
                      <View style={s.sectionHead}>
                        <View style={[s.sectionDot, { backgroundColor: gc }]} />
                        <Text style={[s.sectionName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                        <Text style={s.sectionCount}>
                          {totalVagas} vaga{totalVagas !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      {g.items.length === 0 ? (
                        <Text style={s.groupEmptyRow}>Nenhuma vaga aberta</Text>
                      ) : (
                        g.items.map(item => (
                          <VagaCard key={item.id} item={item} onPress={setDetailVaga} valueCfg={valueCfg} C={C} s={s} />
                        ))
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </>
      )}

      <VagaDetailSheet
        visible={!!detailVaga}
        opening={detailVaga}
        onClose={() => setDetailVaga(null)}
        onClaim={handleClaim}
      />

      <VagaDetailSheet
        visible={!!faltaDetail}
        opening={faltaDetail}
        mode="falta"
        onChamar={(o) => {
          const item = faltaGente.find(f => f.key === o.id);
          if (item) handleChamar(item);
        }}
        onClose={() => setFaltaDetail(null)}
      />

      <CederFlowSheet
        visible={!!chamarShift}
        shift={chamarShift}
        initialMode="targeted"
        title="Sugerir plantão a um colega"
        onClose={() => setChamarShift(null)}
      />
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  retryText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Filter chips
  chipsScroll: { maxHeight: 48 },
  chipsRow: {
    gap: 8, paddingHorizontal: Spacing.screen, paddingVertical: 10, paddingRight: Spacing.screen + 4,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 0.5, borderColor: C.border.light,
    backgroundColor: C.background.elevated,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12.5, fontFamily: Typography.fontFamily.semiBold, maxWidth: 130 },

  // Caption sob o header
  caption: {
    fontSize: 12, fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary, marginBottom: Spacing.md, marginTop: 2,
  },

  // Coordenação banner
  coordBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.accentSoft,
    borderRadius: 12, borderWidth: 0.5, borderColor: C.primary + '33',
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: Spacing.md,
  },
  coordIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.background.elevated,
  },
  coordText: { flex: 1, fontSize: 11.5, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },
  coordBold: { fontFamily: Typography.fontFamily.bold, color: C.text.primary },

  // Section label simples (ex.: "Minhas cessões abertas")
  sectionLabel: {
    fontSize: 11.5, fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },

  // Section header (dot + nome UPPERCASE + contagem)
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginBottom: Spacing.sm,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionName: {
    fontSize: 11, fontFamily: Typography.fontFamily.bold,
    color: C.text.primary, textTransform: 'uppercase', letterSpacing: 1,
  },
  sectionCount: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },

  // Group section
  groupSection: { marginBottom: Spacing.md },
  groupEmptyRow: {
    fontSize: 12.5, fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary, paddingVertical: 6, paddingLeft: 18,
  },

  // Card de plantão (vaga / falta)
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.background.elevated,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.border.light,
    paddingVertical: 11, paddingHorizontal: 13, marginBottom: 9,
    ...Shadows.small,
  },
  cardDayCol: { width: 34, alignItems: 'center', gap: 2 },
  cardAccent: { width: 18, height: 3, borderRadius: 2 },
  cardWk: {
    fontSize: 9.5, fontFamily: Typography.fontFamily.bold,
    color: C.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cardDayNum: { fontSize: 21, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.5, lineHeight: 24 },
  cardMid: { flex: 1, gap: 3 },
  cardShiftLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardShiftName: { fontSize: 14.5, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  cardTeamChip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  cardTeamChipText: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.3, maxWidth: 130 },
  cardTime: { fontSize: 11, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary },
  cardRight: { alignItems: 'flex-end', gap: 5 },
  cardVagaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.accentSoft, borderRadius: 999,
    paddingVertical: 3, paddingHorizontal: 9,
  },
  cardVagaText: { fontSize: 11, fontFamily: Typography.fontFamily.bold, color: C.primary, letterSpacing: -0.1 },
  cardValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardValue: { fontSize: 12, fontFamily: Typography.fontFamily.bold, color: C.money, letterSpacing: 0.1 },

  // My cede card (cessão que eu abri)
  myCedeCard: {
    borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 8,
  },
  myCedeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  myCedeIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  myCedeTitle: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
  myCedeSub:   { fontSize: 11.5, fontFamily: Typography.fontFamily.regular, marginTop: 1 },
  myCedeTime:  { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },
  myCedeCancel: {
    marginTop: 10, paddingVertical: 9, borderRadius: 999,
    alignItems: 'center', borderWidth: 0.5,
  },
  myCedeCancelText: { fontSize: 13, fontFamily: Typography.fontFamily.semiBold },

  // Empty
  empty: { borderRadius: 14, borderWidth: 0.5, padding: 28, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Typography.fontFamily.semiBold },
});
