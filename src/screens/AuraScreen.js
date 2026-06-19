/**
 * Aura (IA do Aurora) — conselho de escala.
 *
 * Painel que analisa o panorama de plantões do mês e orienta onde encaixar
 * outro plantão sem sobrecarga (descanso, horas seguidas, dias seguidos) e
 * respeitando bloqueios/folgas. Tudo via motor determinístico (AuraEngine) —
 * sem rede, sem busca externa.
 *
 * Sub-tela overlay: NÃO renderiza header próprio (AppHeader é injetado pelo
 * MainScreen). Ver memória feedback_subscreen_headers.
 */

import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { loadAvailability } from '../utils/AvailabilityConfig';
import { isAuroraOnly, isViewOnly } from '../utils/userSource';
import {
  rankOpenings,
  analyzeSchedule,
  candidateFromSlot,
  evaluateCandidate,
  shiftToInterval,
  classifyDay,
  scheduledMinutes,
  DAY_STATUS,
  formatMinutes,
  VERDICT,
} from '../utils/AuraEngine';

const TURNOS = [
  { key: 'M', label: 'Manhã' },
  { key: 'T', label: 'Tarde' },
  { key: 'N', label: 'Noite' },
];
const TURNO_RANK = { M: 0, T: 1, N: 2 };

// ícone por tipo de alerta do motor (deixa o motivo visual)
const RULE_ICON = {
  block: 'lock-closed', overlap: 'alert-circle', rest: 'bed', consecutiveHours: 'hourglass',
  consecutiveDays: 'calendar', weekend: 'sunny', blockOverflow: 'warning',
  adjacent: 'information-circle', invalid: 'help-circle',
};
const ruleIcon = (rule) => RULE_ICON[rule] || 'ellipse';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// cor por tipo de plantão — claro/escuro só ajusta legibilidade.
// D (vira-noite) herda Noite; FN (feriado) herda âmbar.
const SHIFT_COLORS = {
  light: { M: '#3FA9A7', T: '#4C8BD0', N: '#5B6FBF', NE: '#E08A00' },
  dark:  { M: '#54BDB7', T: '#7FB4F0', N: '#8590E0', NE: '#E0A33C' },
};
const shiftColor = (t, dark) => {
  const k = t === 'D' ? 'N' : (t === 'FN' || t === 'NE') ? 'NE' : t;
  const m = SHIFT_COLORS[dark ? 'dark' : 'light'];
  return m[k] || m.M;
};

const _todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const _fmtDate = (dateKey) => {
  if (!dateKey) return '';
  const d = new Date(`${dateKey}T00:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function AuraScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const dark = useColorScheme() === 'dark';

  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { daysWithShifts, loadMonthlyShifts, getMonthCache, currentMonth, currentYear } = useShifts();
  const { openings, refresh: refreshOpenings } = useOpenings();

  const [config, setConfig] = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(true);

  // mês exibido no calendário
  const _now = new Date();
  const [viewMonth, setViewMonth] = useState(_now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(_now.getFullYear());

  // tester hipotético (1+ turnos no mesmo dia)
  const [testDate, setTestDate] = useState(_todayKey());
  const [testTurnos, setTestTurnos] = useState(['M']);
  const toggleTestTurno = (k) =>
    setTestTurnos(prev => {
      if (prev.includes(k)) {
        const next = prev.filter(t => t !== k);
        return next.length ? next : prev; // sempre ≥1 turno selecionado
      }
      return [...prev, k];
    });

  // Carrega o mês exibido. Deps são só os primitivos do mês — NÃO a identidade de
  // loadMonthlyShifts (que muda a cada render do ShiftsContext e geraria loop de
  // render→load→setState→render martelando o Firebase).
  useEffect(() => {
    loadMonthlyShifts?.(viewMonth, viewYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth, viewYear]);

  // Vagas uma vez na montagem (refreshOpenings tem staleness próprio de 15min).
  useEffect(() => {
    refreshOpenings?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadConfig = useCallback(async () => {
    if (!userId) return;
    setLoadingCfg(true);
    const cfg = await loadAvailability(userId);
    setConfig(cfg);
    setLoadingCfg(false);
  }, [userId]);

  useEffect(() => { reloadConfig(); }, [reloadConfig]);

  // dias do mês exibido (cache do mês ou mês ativo)
  const monthDays = useMemo(() => {
    const cached = getMonthCache?.(viewMonth, viewYear)?.daysWithShifts;
    if (cached) return cached;
    if (currentMonth === viewMonth && currentYear === viewYear) return daysWithShifts || [];
    return [];
  }, [getMonthCache, viewMonth, viewYear, currentMonth, currentYear, daysWithShifts]);

  // plantões do mês exibido, achatados
  const shifts = useMemo(() => monthDays.flatMap(d => d.shifts || []), [monthDays]);

  const analysis = useMemo(
    () => (config ? analyzeSchedule(shifts, config) : null),
    [shifts, config],
  );

  const ranked = useMemo(
    () => (config ? rankOpenings(openings, shifts, config) : []),
    [openings, shifts, config],
  );

  // tipos de plantão por dia (bolinhas coloridas)
  const shiftTypesByDate = useMemo(() => {
    const map = {};
    shifts.forEach(sh => {
      const dk = sh.date || (sh.startISO || '').slice(0, 10);
      if (!dk) return;
      const lbl = (sh.label || '').charAt(0).toUpperCase();
      (map[dk] = map[dk] || new Set()).add(lbl);
    });
    return map;
  }, [shifts]);

  // compromissos por dia da semana (com cor)
  const blocksByWeekday = useMemo(() => {
    const map = {};
    (config?.recurringBlocks || []).forEach(b => { (map[b.weekday] = map[b.weekday] || []).push(b); });
    return map;
  }, [config]);

  // eventos pontuais por data específica (com cor)
  const eventsByDate = useMemo(() => {
    const map = {};
    (config?.events || []).forEach(e => { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [config]);

  const isFolga = useCallback(
    (dk) => (config?.folgas || []).some(f => f.startDate && f.endDate && dk >= f.startDate && dk <= f.endDate),
    [config],
  );

  // meta de horas (fidelização) vs agendado no mês
  const targetHours = config?.targetHours || 0;
  const scheduledMin = useMemo(() => scheduledMinutes(shifts, config), [shifts, config]);
  const belowTarget = targetHours > 0 && scheduledMin < targetHours * 60;
  const gapMin = Math.max(0, targetHours * 60 - scheduledMin);
  // Verde no calendário: sem meta → sempre sinaliza dias bons; com meta → só
  // enquanto ainda faltam horas. (Antes ficava preso à meta e nada colorava.)
  const greenAllowed = targetHours === 0 || belowTarget;

  // vagas abertas por dia (pra cruzar com os dias sugeridos)
  const openingByDate = useMemo(() => {
    const m = {};
    (openings || []).forEach(o => {
      const dk = o.dateKey || (o.startISO || '').slice(0, 10);
      if (dk && !m[dk]) m[dk] = o;
    });
    return m;
  }, [openings]);

  // classificação determinística de cada dia (cor de fundo do calendário)
  const existingIntervals = useMemo(() => shifts.map(shiftToInterval).filter(Boolean), [shifts]);
  const dayStatus = useMemo(() => {
    if (!config) return {};
    const map = {};
    const dim = new Date(viewYear, viewMonth, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dk = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      map[dk] = classifyDay(dk, existingIntervals, config, { greenAllowed, needHours: belowTarget });
    }
    return map;
  }, [config, existingIntervals, greenAllowed, belowTarget, viewMonth, viewYear]);

  // dias com pelo menos um turno livre seguro (pra completar horas).
  // Com "evitar FDS" ligado, os dias de fim de semana (status WEEKEND) não contam
  // como livres — o usuário escolheu evitá-los.
  const availableDaysCount = useMemo(
    () => Object.values(dayStatus).filter(
      st => (st.safeTurnos?.length || 0) > 0 && st.status !== DAY_STATUS.WEEKEND,
    ).length,
    [dayStatus],
  );

  // dias sugeridos (good), com vaga aberta quando houver
  const suggestions = useMemo(() => {
    if (!belowTarget) return [];
    return Object.entries(dayStatus)
      .filter(([, st]) => st.status === DAY_STATUS.GOOD)
      .map(([dk, st]) => ({ dateKey: dk, safeTurnos: st.safeTurnos, opening: openingByDate[dk] || null }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [dayStatus, belowTarget, openingByDate]);

  // grade do calendário: semanas de 7 (null = célula vazia)
  const weeks = useMemo(() => {
    const startWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells = Array(startWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [viewMonth, viewYear]);

  const shiftMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    setViewMonth(m); setViewYear(y);
  };

  // resumo do dia selecionado (plantões + compromissos)
  const selDayTypes = shiftTypesByDate[testDate] ? [...shiftTypesByDate[testDate]] : [];
  const selDayBlocks = (config?.recurringBlocks || []).filter(b => b.weekday === new Date(`${testDate}T00:00:00`).getDay());
  const selDayEvents = (config?.events || []).filter(e => e.date === testDate);
  const selDayFolga = isFolga(testDate);

  // Motivo do bloqueio quando o dia está "cheio" mas não tem evento próprio
  // (ex.: passaria do máximo de dias seguidos).
  const selDayBlockReason = useMemo(() => {
    if (!config || dayStatus[testDate]?.status !== DAY_STATUS.FULL) return null;
    for (const t of ['M', 'T', 'N']) {
      const ev = evaluateCandidate(candidateFromSlot(testDate, t), existingIntervals, config);
      const blk = ev.violations.find(v => v.severity === 'block');
      if (blk) return blk.message;
    }
    return null;
  }, [config, dayStatus, testDate, existingIntervals]);

  // Resultado por turno (cada turno vê os demais selecionados como já marcados),
  // em ordem M → T → N. Cada turno tem seu próprio veredito + motivos.
  const testResults = useMemo(() => {
    if (!config || testTurnos.length === 0) return [];
    const picked = testTurnos
      .map(t => ({ t, cand: candidateFromSlot(testDate, t) }))
      .filter(p => p.cand)
      .sort((a, b) => TURNO_RANK[a.t] - TURNO_RANK[b.t]);
    return picked.map(({ t, cand }) => {
      // os outros turnos testados entram como "simulados" (não são plantão real)
      const ctx = [...existingIntervals, ...picked.filter(p => p.t !== t).map(p => ({ ...p.cand, simulated: true }))];
      const ev = evaluateCandidate(cand, ctx, config);
      return { turno: t, label: TURNOS.find(x => x.key === t)?.label || t, verdict: ev.verdict, violations: ev.violations };
    });
  }, [config, testDate, testTurnos, existingIntervals]);

  const verdictStyle = (verdict) => {
    switch (verdict) {
      case VERDICT.SAFE:    return { color: C.money,   bg: C.moneySoft,   icon: 'checkmark-circle', text: 'Pode encaixar' };
      case VERDICT.RISKY:   return { color: C.warning, bg: C.warningSoft, icon: 'alert-circle',     text: 'Arriscado' };
      default:              return { color: C.error,   bg: C.error + '22', icon: 'close-circle',    text: 'Bloqueado' };
    }
  };

  // cor do motivo conforme severidade (info não é alerta)
  const reasonColor = (severity) =>
    severity === 'block' ? C.error : severity === 'warn' ? C.warning : C.text.secondary;

  // ── Barra do dia selecionado (chips) ──────────────────────────────────────
  const selDayObj = new Date(`${testDate}T00:00:00`);
  const selDayNum = selDayObj.getDate();
  const selWeekdayName = WEEKDAYS_FULL[selDayObj.getDay()];
  const selMonthName = MONTH_NAMES[selDayObj.getMonth()];
  const selBlocked = dayStatus[testDate]?.status === DAY_STATUS.FULL;
  const dayBarChips = useMemo(() => {
    const out = [];
    if (selDayFolga) out.push({ key: 'folga', label: 'Folga', color: C.warning });
    selDayTypes.forEach(t => out.push({ key: `t${t}`, label: `Plantão ${TURNOS.find(x => x.key === t)?.label || t}`, color: shiftColor(t, dark) }));
    selDayBlocks.forEach(b => out.push({ key: `b${b.id}`, label: `${b.label}${b.mode === 'time' ? ` ${b.startTime}–${b.endTime}` : ''}`, color: b.color || C.warning }));
    selDayEvents.forEach(e => out.push({ key: `e${e.id}`, label: e.label, color: e.color || C.info }));
    if (openingByDate[testDate]) out.push({ key: 'vaga', label: 'Vaga aberta', color: C.money });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDate, selDayFolga, selDayTypes, selDayBlocks, selDayEvents, openingByDate, dark]);

  // ── SectionTitle: kicker mono + título ────────────────────────────────────
  const SectionTitle = ({ kicker, title, right }) => (
    <View style={s.sectionTitle}>
      <View style={{ flex: 1 }}>
        {!!kicker && <Text style={s.sectionKicker}>{kicker}</Text>}
        <Text style={s.sectionHeading}>{title}</Text>
      </View>
      {right}
    </View>
  );

  if (loadingCfg && !config) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + Spacing.xl }}
    >
      {/* Intro */}
      <View style={s.intro}>
        <View style={s.introIcon}>
          <Ionicons name="sparkles" size={20} color={C.primary} />
        </View>
        <Text style={s.introText}>
          <Text style={s.introStrong}>Análise da sua escala</Text> para evitar sobrecarga.
        </Text>
      </View>

      {/* Parâmetros */}
      <Pressable style={s.paramRow} onPress={() => navigation?.navigate?.('AuraAvailabilityScreen')}>
        <View style={s.paramIcon}><Ionicons name="options-outline" size={17} color={C.text.secondary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.paramTitle}>Parâmetros</Text>
          <Text style={s.paramSub}>bloqueios, folgas e meta</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={C.text.tertiary} />
      </Pressable>

      {/* Panorama */}
      <View style={s.card}>
        <View style={s.statsRow}>
          {[
            { v: analysis?.shiftCount ?? 0, l: 'plantões', money: false },
            { v: analysis?.maxConsecutiveDays ?? 0, l: 'máx. seguidos', money: false },
            { v: availableDaysCount, l: 'dias livres', money: availableDaysCount > 0 },
          ].map((st, i) => (
            <View key={i} style={[s.stat, i > 0 && s.statDivider]}>
              <Text style={[s.statValue, st.money && { color: C.money }]}>{st.v}</Text>
              <Text style={s.statLabel}>{st.l}</Text>
            </View>
          ))}
        </View>
        {(analysis?.restAlerts || []).length > 0 && (
          <View style={s.alertsWrap}>
            {(analysis?.restAlerts || []).map((a, i) => (
              <View key={i} style={s.alertRow}>
                <Ionicons name="bed-outline" size={16} color={C.warning} />
                <Text style={s.alertText}>{a}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Calendário */}
      <SectionTitle kicker="Sua escala" title="Calendário" />
      <View style={s.heroCard}>
        {/* header mês */}
        <View style={s.calHeader}>
          <Pressable onPress={() => shiftMonth(-1)} style={s.calNavBtn}><Ionicons name="chevron-back" size={18} color={C.text.secondary} /></Pressable>
          <Text style={s.calTitle}>{MONTH_NAMES[viewMonth - 1]} {viewYear}</Text>
          <Pressable onPress={() => shiftMonth(1)} style={s.calNavBtn}><Ionicons name="chevron-forward" size={18} color={C.text.secondary} /></Pressable>
        </View>

        {/* dias da semana */}
        <View style={s.calWeekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={[s.calWeekday, (i === 0 || i === 6) && { color: C.info }]}>{w}</Text>
          ))}
        </View>

        {/* grade — status comunicado por "piso" colorido + tinte ultrassuave */}
        {weeks.map((week, wi) => (
          <View key={wi} style={s.calRow}>
            {week.map((dk, di) => {
              if (!dk) return <View key={di} style={s.calCell} />;
              const d = new Date(`${dk}T00:00:00`);
              const types = shiftTypesByDate[dk] ? [...shiftTypesByDate[dk]] : [];
              const dayBlocks = [...(blocksByWeekday[d.getDay()] || []), ...(eventsByDate[dk] || [])];
              const status = dayStatus[dk]?.status;
              const hasOpening = !!openingByDate[dk];
              const selected = dk === testDate;
              const today = dk === _todayKey();
              const sc = status === DAY_STATUS.FOLGA ? C.warning
                : status === DAY_STATUS.FULL ? C.error
                : status === DAY_STATUS.GOOD ? C.money
                : status === DAY_STATUS.WEEKEND ? C.info
                : null;
              return (
                <Pressable key={di} onPress={() => setTestDate(dk)} style={s.calCell}>
                  <View style={[
                    s.calDay,
                    sc && !selected && { backgroundColor: sc + (dark ? '22' : '14') },
                    today && !selected && s.calToday,
                    selected && { backgroundColor: C.primary },
                  ]}>
                    {sc && !selected && <View style={[s.calFloor, { backgroundColor: sc }]} />}
                    {hasOpening && <View style={[s.calVagaRing, { borderColor: selected ? '#fff' : C.money }]} />}
                    {dayBlocks.length > 0 && <View style={[s.calCompSquare, { backgroundColor: selected ? '#fff' : (dayBlocks[0].color || C.warning) }]} />}
                    <Text style={[s.calDayNum, (today || selected) && { fontFamily: Typography.fontFamily.bold }, selected && { color: '#fff' }]}>{d.getDate()}</Text>
                    <View style={s.calDots}>
                      {types.slice(0, 3).map((t, k) => (
                        <View key={k} style={[s.calDot, { backgroundColor: selected ? 'rgba(255,255,255,0.9)' : shiftColor(t, dark) }]} />
                      ))}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* legenda */}
        <View style={s.calLegend}>
          {[['completar', 'pode completar', C.money], ['cheio', 'cheio', C.error], ['folga', 'folga', C.warning], ['fds', 'fim de semana', C.info]].map(([k, lbl, c]) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: c + (dark ? '22' : '14') }]}>
                <View style={[s.legendSwatchFloor, { backgroundColor: c }]} />
              </View>
              <Text style={s.legendText}>{lbl}</Text>
            </View>
          ))}
          <View style={s.legendItem}>
            <View style={[s.calVagaRing, s.legendRing, { borderColor: C.money }]} />
            <Text style={s.legendText}>vaga aberta</Text>
          </View>
        </View>

        {/* barra do dia selecionado */}
        <View style={s.dayBar}>
          <View style={s.dayBarHead}>
            <Ionicons name="calendar-outline" size={14} color={C.primary} />
            <Text style={s.dayBarTitle}>{selDayNum} de {selMonthName.toLowerCase()} · {selWeekdayName}</Text>
          </View>
          {dayBarChips.length > 0 ? (
            <View style={s.dayBarChips}>
              {dayBarChips.map(c => (
                <View key={c.key} style={[s.dayChip, { backgroundColor: c.color + (dark ? '22' : '18') }]}>
                  <View style={[s.dayChipDot, { backgroundColor: c.color }]} />
                  <Text style={[s.dayChipText, { color: c.color }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          ) : selBlocked ? (
            <Text style={s.dayBarBlocked}>{selDayBlockReason || 'Dia cheio — sem espaço para encaixar plantão.'}</Text>
          ) : (
            <Text style={s.dayBarEmpty}>Sem eventos neste dia.</Text>
          )}
        </View>
      </View>

      {/* Simular */}
      <View style={s.heroCard2}>
        <SectionTitle kicker="Testar" title="Simular plantão" />
        <Text style={s.simHint}>Escolha turnos para ver se cabem no dia <Text style={s.simHintStrong}>{_fmtDate(testDate)}</Text>.</Text>

        <View style={s.turnoRow}>
          {TURNOS.map(t => {
            const active = testTurnos.includes(t.key);
            const occupied = selDayTypes.includes(t.key);
            const c = shiftColor(t.key, dark);
            return (
              <Pressable key={t.key} onPress={() => toggleTestTurno(t.key)} style={[s.turnoChip, active && { backgroundColor: c, borderColor: 'transparent' }]}>
                <Text style={[s.turnoText, active && { color: '#fff' }]}>{t.label}</Text>
                {occupied && <Text style={[s.turnoTag, active && { color: 'rgba(255,255,255,0.85)' }]}>já tem</Text>}
              </Pressable>
            );
          })}
        </View>

        {testTurnos.length === 0 ? (
          <Text style={s.simEmpty}>Selecione um turno acima para simular.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {testResults.map(r => {
              const v = verdictStyle(r.verdict);
              const c = shiftColor(r.turno, dark);
              const headIcon = v.icon === 'checkmark-circle' ? 'checkmark' : v.icon === 'alert-circle' ? 'warning' : 'close';
              return (
                <View key={r.turno} style={[s.verdictCard, { borderColor: v.color + (dark ? '55' : '40') }]}>
                  <View style={[s.verdictHead, { backgroundColor: v.bg }]}>
                    <View style={[s.verdictHeadIcon, { backgroundColor: v.color }]}>
                      <Ionicons name={headIcon} size={14} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.verdictTurno, { color: v.color }]}>{r.label.toUpperCase()}</Text>
                      <Text style={s.verdictLabel}>{v.text}</Text>
                    </View>
                    <View style={[s.verdictDot, { backgroundColor: c }]} />
                  </View>
                  <View style={s.verdictBody}>
                    {r.violations.length === 0 ? (
                      <View style={s.reasonRow}>
                        <Ionicons name="checkmark-circle" size={15} color={C.money} />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.reasonTitle, { color: C.money }]}>Sem conflitos</Text>
                          <Text style={s.reasonSub}>encaixa tranquilo no seu dia</Text>
                        </View>
                      </View>
                    ) : r.violations.map((vi, i) => (
                      <View key={i} style={[s.reasonRow, i > 0 && s.reasonDivider]}>
                        <Ionicons name={ruleIcon(vi.rule)} size={15} color={reasonColor(vi.severity)} style={{ marginTop: 1 }} />
                        <Text style={[s.reasonTitle, { flex: 1, color: reasonColor(vi.severity) }]}>{vi.message}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Bater a meta */}
      {targetHours > 0 && (
        <View style={s.card}>
          <SectionTitle kicker="Meta de horas" title="Bater a meta" right={<Ionicons name="locate" size={18} color={C.primary} />} />

          <View style={s.metaRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={s.metaBig}>{formatMinutes(scheduledMin)}</Text>
              <Text style={s.metaOf}> / {targetHours}h</Text>
            </View>
            {gapMin > 0 ? (
              <View style={s.metaGapPill}>
                <Text style={[s.metaGapText, { color: C.warning }]}>faltam {formatMinutes(gapMin)}</Text>
              </View>
            ) : (
              <View style={[s.metaGapPill, { backgroundColor: C.moneySoft }]}>
                <Text style={[s.metaGapText, { color: C.money }]}>meta batida</Text>
              </View>
            )}
          </View>
          <View style={s.progressTrack}>
            <LinearGradient
              colors={[C.primary, C.money]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.progressFill, { width: `${Math.min(100, (scheduledMin / (targetHours * 60)) * 100)}%` }]}
            />
          </View>

          {gapMin > 0 && (
            suggestions.length === 0 ? (
              <View style={s.metaEmptyRow}>
                <Ionicons name="alert-circle-outline" size={15} color={C.text.tertiary} />
                <Text style={s.metaEmptyText}>Nenhum dia livre seguro neste mês — reveja seus compromissos.</Text>
              </View>
            ) : (
              <>
                <Text style={s.metaSubhead}>DIAS BONS PRA COMPLETAR</Text>
                <View style={{ gap: 8 }}>
                  {suggestions.slice(0, 8).map(({ dateKey, safeTurnos, opening }) => {
                    const d = new Date(`${dateKey}T00:00:00`);
                    return (
                      <Pressable key={dateKey} style={[s.goodDay, dateKey === testDate && { borderColor: C.primary }]} onPress={() => { setTestDate(dateKey); if (safeTurnos?.length) setTestTurnos([...safeTurnos]); }}>
                        <View style={s.goodDayDate}>
                          <Text style={s.goodDayNum}>{d.getDate()}</Text>
                          <Text style={s.goodDayWd}>{WEEKDAYS[d.getDay()]}</Text>
                        </View>
                        <View style={s.goodDayTurnos}>
                          {safeTurnos.map(t => {
                            const c = shiftColor(t, dark);
                            return (
                              <View key={t} style={[s.goodDayChip, { backgroundColor: c + (dark ? '22' : '18') }]}>
                                <Text style={[s.goodDayChipText, { color: c }]}>{TURNOS.find(x => x.key === t)?.label || t}</Text>
                              </View>
                            );
                          })}
                        </View>
                        {opening && (
                          <View style={s.goodDayVaga}>
                            <View style={[s.calVagaRing, s.legendRing, { borderColor: C.money }]} />
                            <Text style={s.goodDayVagaText}>vaga</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {!isViewOnly(user) && ranked.some(r => r.evaluation.verdict !== VERDICT.BLOCKED) && (
                  <Pressable style={s.metaLink} onPress={() => navigation?.navigate?.(isAuroraOnly(user) ? 'OpeningsScreen' : 'NetworkVacanciesScreen')}>
                    <Text style={s.metaLinkText}>Ver vagas abertas</Text>
                    <Ionicons name="arrow-forward" size={15} color={C.primary} />
                  </Pressable>
                )}
              </>
            )
          )}
        </View>
      )}

      {/* Vagas avaliadas */}
      <SectionTitle kicker="Suas redes" title="Vagas avaliadas" right={ranked.length > 0 ? <Text style={s.vagaCount}>{ranked.length}</Text> : null} />
      {ranked.length === 0 ? (
        <View style={s.card}><Text style={s.cardHint}>Nenhuma vaga disponível nos seus grupos agora.</Text></View>
      ) : (
        <View style={{ gap: 9 }}>
          {ranked.map(({ opening, interval, evaluation }) => {
            const v = verdictStyle(evaluation.verdict);
            const d = interval?.dateKey ? new Date(`${interval.dateKey}T00:00:00`) : null;
            const c = shiftColor(interval?.label, dark);
            return (
              <View key={opening.id} style={s.vagaCard}>
                <View style={s.goodDayDate}>
                  <Text style={s.goodDayNum}>{d ? d.getDate() : '?'}</Text>
                  <Text style={s.goodDayWd}>{d ? WEEKDAYS[d.getDay()] : ''}</Text>
                </View>
                <View style={s.vagaDivider} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.vagaTitleRow}>
                    <View style={[s.vagaTurnoDot, { backgroundColor: c }]} />
                    <Text style={s.vagaTurno}>{TURNOS.find(x => x.key === interval?.label)?.label || interval?.label || 'Plantão'}</Text>
                    <Text style={s.vagaGroup} numberOfLines={1}>· {opening.group?.name || 'Plantão'}</Text>
                  </View>
                  {evaluation.violations?.[0] && (
                    <Text style={[s.vagaReason, { color: reasonColor(evaluation.violations[0].severity) }]} numberOfLines={1}>{evaluation.violations[0].message}</Text>
                  )}
                </View>
                <View style={[s.vagaPill, { backgroundColor: v.bg }]}>
                  <Ionicons name={v.icon} size={12} color={v.color} />
                  <Text style={[s.vagaPillText, { color: v.color }]}>{v.text}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background.secondary },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Intro
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.element, paddingHorizontal: 2, marginBottom: Spacing.md },
  introIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.regular, color: C.text.secondary, lineHeight: 20 },
  introStrong: { fontFamily: Typography.fontFamily.bold, color: C.text.primary },

  // Section title (kicker mono + heading)
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginHorizontal: 2, marginBottom: Spacing.element },
  sectionKicker: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 1.2, textTransform: 'uppercase', color: C.text.tertiary },
  sectionHeading: { fontSize: Typography.fontSize.headline, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.3, marginTop: 2 },

  // Cards
  card: {
    backgroundColor: C.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 0.5,
    borderColor: C.border.light,
    padding: Spacing.card,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  heroCard: {
    backgroundColor: C.background.card,
    borderRadius: BorderRadius.xl,
    borderWidth: 0.5,
    borderColor: C.border.light,
    paddingBottom: 4,
    marginBottom: Spacing.md,
    ...Shadows.medium,
  },
  heroCard2: {
    backgroundColor: C.background.card,
    borderRadius: BorderRadius.xl,
    borderWidth: 0.5,
    borderColor: C.border.light,
    padding: Spacing.card,
    marginBottom: Spacing.md,
    ...Shadows.medium,
  },
  cardHint: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary },

  // Parâmetros
  paramRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.element,
    backgroundColor: C.background.card, borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: C.border.light,
    paddingVertical: 13, paddingHorizontal: 15, ...Shadows.small,
    marginBottom: Spacing.md,
  },
  paramIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.background.secondary, alignItems: 'center', justifyContent: 'center' },
  paramTitle: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  paramSub: { fontSize: Typography.fontSize.caption1, color: C.text.tertiary, marginTop: 1 },

  // Panorama
  statsRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: 0.5, borderLeftColor: C.border.light },
  statValue: { fontSize: Typography.fontSize.title2, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.6 },
  statLabel: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary, textAlign: 'center', marginTop: 2 },
  alertsWrap: { marginTop: Spacing.element, paddingTop: Spacing.element, borderTopWidth: 0.5, borderTopColor: C.border.light, gap: Spacing.sm },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  alertText: { flex: 1, fontSize: Typography.fontSize.footnote, color: C.text.secondary, lineHeight: 17 },

  // Calendário
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: 15, paddingBottom: Spacing.element },
  calTitle: { fontSize: Typography.fontSize.callout, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.2 },
  calNavBtn: { width: 34, height: 34, borderRadius: BorderRadius.sm, backgroundColor: C.background.secondary, alignItems: 'center', justifyContent: 'center' },
  calWeekRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: Spacing.xs },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.caption3, color: C.text.tertiary, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.3 },
  calRow: { flexDirection: 'row', paddingHorizontal: 10 },
  calCell: { flex: 1, aspectRatio: 1, padding: 1.5 },
  calDay: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1.5, borderColor: 'transparent', overflow: 'hidden' },
  calToday: { borderColor: C.primary },
  calFloor: { position: 'absolute', left: 7, right: 7, bottom: 4, height: 2.5, borderRadius: 2, opacity: 0.85 },
  calVagaRing: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.6, backgroundColor: 'transparent' },
  calCompSquare: { position: 'absolute', top: 5, left: 5, width: 6, height: 6, borderRadius: 2 },
  calDayNum: { fontSize: Typography.fontSize.subhead, color: C.text.primary, fontFamily: Typography.fontFamily.regular, lineHeight: 16 },
  calDots: { flexDirection: 'row', gap: 3, height: 5, alignItems: 'center', justifyContent: 'center' },
  calDot: { width: 5, height: 5, borderRadius: 2.5 },

  // Legenda
  calLegend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: 14, marginHorizontal: Spacing.md, marginTop: 4, paddingTop: Spacing.element, borderTopWidth: 0.5, borderTopColor: C.border.light },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, height: 8, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  legendSwatchFloor: { position: 'absolute', left: 2, right: 2, bottom: 1.5, height: 2, borderRadius: 1 },
  legendRing: { position: 'relative', top: 0, right: 0, width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: Typography.fontSize.caption1, color: C.text.secondary, fontFamily: Typography.fontFamily.semiBold },

  // Barra do dia selecionado
  dayBar: { margin: Spacing.element, marginTop: Spacing.element, padding: 12, paddingHorizontal: 14, borderRadius: BorderRadius.md, backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light },
  dayBarHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayBarTitle: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.bold, color: C.text.primary, textTransform: 'capitalize' },
  dayBarChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  dayChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.pill },
  dayChipDot: { width: 5, height: 5, borderRadius: 2.5 },
  dayChipText: { fontSize: Typography.fontSize.caption1, fontFamily: Typography.fontFamily.bold },
  dayBarBlocked: { fontSize: Typography.fontSize.caption1, color: C.error, fontFamily: Typography.fontFamily.semiBold, marginTop: 9 },
  dayBarEmpty: { fontSize: Typography.fontSize.caption1, color: C.text.tertiary, marginTop: 9 },

  // Simular
  simHint: { fontSize: Typography.fontSize.caption1, color: C.text.tertiary, marginTop: 2, marginBottom: Spacing.element, marginHorizontal: 2, lineHeight: 16 },
  simHintStrong: { fontFamily: Typography.fontFamily.bold, color: C.text.secondary },
  simEmpty: { fontSize: Typography.fontSize.footnote, color: C.text.tertiary, textAlign: 'center', paddingVertical: 24 },
  turnoRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.element },
  turnoChip: { flex: 1, paddingVertical: 11, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.border.light, alignItems: 'center', backgroundColor: C.background.secondary },
  turnoText: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.bold, color: C.text.secondary },
  turnoTag: { fontSize: Typography.fontSize.caption3, color: C.text.tertiary, marginTop: 1 },

  // Verdict card
  verdictCard: { borderWidth: 0.5, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  verdictHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 10 },
  verdictHeadIcon: { width: 26, height: 26, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  verdictTurno: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.5 },
  verdictLabel: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -0.2, marginTop: 1 },
  verdictDot: { width: 9, height: 9, borderRadius: 4.5 },
  verdictBody: { backgroundColor: C.background.card, paddingHorizontal: 13, paddingVertical: 5 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 8 },
  reasonDivider: { borderTopWidth: 0.5, borderTopColor: C.border.light },
  reasonTitle: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.bold, color: C.text.primary, lineHeight: 17 },
  reasonSub: { fontSize: Typography.fontSize.caption1, color: C.text.tertiary, marginTop: 1 },

  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: Spacing.element, marginBottom: 10 },
  metaBig: { fontSize: Typography.fontSize.title1, fontFamily: Typography.fontFamily.bold, color: C.text.primary, letterSpacing: -1 },
  metaOf: { fontSize: Typography.fontSize.callout, fontFamily: Typography.fontFamily.semiBold, color: C.text.tertiary },
  metaGapPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.warningSoft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: BorderRadius.pill },
  metaGapText: { fontSize: Typography.fontSize.caption1, fontFamily: Typography.fontFamily.bold },
  progressTrack: { height: 9, borderRadius: 6, backgroundColor: C.background.secondary, marginBottom: Spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  metaSubhead: { fontSize: 10, fontFamily: Typography.fontFamily.bold, letterSpacing: 0.8, color: C.text.tertiary, marginHorizontal: 2, marginBottom: 9 },
  metaEmptyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginTop: Spacing.md },
  metaEmptyText: { flex: 1, fontSize: Typography.fontSize.footnote, color: C.text.tertiary },

  goodDay: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 11, borderRadius: BorderRadius.md, backgroundColor: C.background.secondary, borderWidth: 0.5, borderColor: C.border.light },
  goodDayDate: { width: 34, alignItems: 'center' },
  goodDayNum: { fontSize: Typography.fontSize.callout, fontFamily: Typography.fontFamily.bold, color: C.text.primary, lineHeight: 18 },
  goodDayWd: { fontSize: Typography.fontSize.caption3, color: C.text.tertiary, marginTop: 1 },
  goodDayTurnos: { flex: 1, flexDirection: 'row', gap: 6 },
  goodDayChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: BorderRadius.pill },
  goodDayChipText: { fontSize: Typography.fontSize.caption1, fontFamily: Typography.fontFamily.bold },
  goodDayVaga: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  goodDayVagaText: { fontSize: Typography.fontSize.caption2, color: C.money, fontFamily: Typography.fontFamily.bold },
  metaLink: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13 },
  metaLinkText: { fontSize: Typography.fontSize.subhead, color: C.primary, fontFamily: Typography.fontFamily.bold },

  // Vagas avaliadas
  vagaCount: { fontSize: Typography.fontSize.footnote, color: C.text.tertiary, fontFamily: Typography.fontFamily.bold },
  vagaCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.element, backgroundColor: C.background.card, borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: C.border.light, paddingVertical: 11, paddingHorizontal: 13, ...Shadows.small },
  vagaDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border.light },
  vagaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  vagaTurnoDot: { width: 7, height: 7, borderRadius: 3.5 },
  vagaTurno: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  vagaGroup: { flex: 1, fontSize: Typography.fontSize.caption1, color: C.text.tertiary },
  vagaReason: { fontSize: Typography.fontSize.caption1, marginTop: 3 },
  vagaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.pill },
  vagaPillText: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.bold },
});
