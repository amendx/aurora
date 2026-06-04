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
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import { useOpenings } from '../contexts/OpeningsContext';
import { loadAvailability } from '../utils/AvailabilityConfig';
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

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// cor da bolinha por tipo de plantão
const SHIFT_TYPE_COLOR = { M: '#3FA9A7', T: '#97CAFC', N: '#5B6FBF', D: '#5B6FBF', FN: '#E08A00' };

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

  // dias com pelo menos um turno livre seguro (pra completar horas)
  const availableDaysCount = useMemo(
    () => Object.values(dayStatus).filter(st => (st.safeTurnos?.length || 0) > 0).length,
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
        <Ionicons name="sparkles" size={18} color={C.primary} />
        <Text style={s.introText}>
          Análise da sua escala para evitar sobrecarga.
        </Text>
      </View>

      {/* Parâmetros (bloqueios, folgas, meta) */}
      <Pressable style={s.manageBtn} onPress={() => navigation?.navigate?.('AuraAvailabilityScreen')}>
        <Ionicons name="options-outline" size={18} color={C.primary} />
        <Text style={s.manageText}>Parâmetros · bloqueios, folgas e meta</Text>
        <Ionicons name="chevron-forward" size={18} color={C.text.tertiary} />
      </Pressable>

      {/* Panorama */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Panorama do mês</Text>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{analysis?.shiftCount ?? 0}</Text>
            <Text style={s.statLabel}>plantões</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{analysis?.maxConsecutiveDays ?? 0}</Text>
            <Text style={s.statLabel}>dias seguidos (máx)</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statValue, availableDaysCount > 0 && { color: C.money }]}>{availableDaysCount}</Text>
            <Text style={s.statLabel}>dias livres</Text>
          </View>
        </View>
        {(analysis?.restAlerts || []).map((a, i) => (
          <View key={i} style={s.alertRow}>
            <Ionicons name="alert-circle" size={14} color={C.warning} />
            <Text style={s.alertText}>{a}</Text>
          </View>
        ))}
      </View>

      {/* Calendário do mês */}
      <View style={s.card}>
        <View style={s.calHeader}>
          <Pressable hitSlop={10} onPress={() => shiftMonth(-1)}><Ionicons name="chevron-back" size={20} color={C.primary} /></Pressable>
          <Text style={s.calTitle}>{MONTH_NAMES[viewMonth - 1]} {viewYear}</Text>
          <Pressable hitSlop={10} onPress={() => shiftMonth(1)}><Ionicons name="chevron-forward" size={20} color={C.primary} /></Pressable>
        </View>

        <View style={s.calWeekRow}>
          {WEEKDAYS_MIN.map((w, i) => (
            <Text key={i} style={s.calWeekday}>{w}</Text>
          ))}
        </View>

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
              const bg = status === DAY_STATUS.FOLGA ? C.warningSoft
                : status === DAY_STATUS.FULL ? C.error + '1F'
                : status === DAY_STATUS.GOOD ? C.moneySoft
                : status === DAY_STATUS.WEEKEND ? C.info + '24'
                : null;
              return (
                <Pressable key={di} onPress={() => setTestDate(dk)} style={s.calCell}>
                  <View style={[
                    s.calDay,
                    bg && { backgroundColor: bg },
                    today && !selected && { borderColor: C.border.medium, borderWidth: 1 },
                    selected && { backgroundColor: C.primary, borderColor: C.primary, borderWidth: 1 },
                  ]}>
                    <Text style={[s.calDayNum, selected && { color: '#fff' }]}>{d.getDate()}</Text>
                    <View style={s.calDots}>
                      {types.slice(0, 3).map((t, k) => (
                        <View key={`s${k}`} style={[s.calDot, { backgroundColor: selected ? '#fff' : (SHIFT_TYPE_COLOR[t] || C.primary) }]} />
                      ))}
                      {dayBlocks.slice(0, 2).map((b, k) => (
                        <View key={`b${k}`} style={[s.calDot, s.calDotBlock, { backgroundColor: selected ? '#fff' : (b.color || C.warning) }]} />
                      ))}
                      {hasOpening && status === DAY_STATUS.GOOD && (
                        <View style={[s.calDot, s.calVagaDot, { borderColor: selected ? '#fff' : C.money }]} />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={s.calLegend}>
          <View style={[s.calSwatch, { backgroundColor: C.moneySoft }]} /><Text style={s.calLegendText}>pode completar</Text>
          <View style={[s.calSwatch, { backgroundColor: C.error + '1F', marginLeft: Spacing.sm }]} /><Text style={s.calLegendText}>cheio</Text>
          <View style={[s.calSwatch, { backgroundColor: C.warningSoft, marginLeft: Spacing.sm }]} /><Text style={s.calLegendText}>folga</Text>
          {config?.avoidWeekend && (<>
            <View style={[s.calSwatch, { backgroundColor: C.info + '24', marginLeft: Spacing.sm }]} /><Text style={s.calLegendText}>FDS</Text>
          </>)}
          <View style={[s.calDot, s.calVagaDot, { borderColor: C.money, marginLeft: Spacing.sm }]} /><Text style={s.calLegendText}>vaga aberta</Text>
        </View>

        {/* O que tem no dia selecionado (legenda abaixo do calendário) */}
        <View style={s.selDayBar}>
          <Text style={s.selDayLabel}>{_fmtDate(testDate)}:</Text>
          {!(selDayTypes.length > 0 || selDayBlocks.length > 0 || selDayEvents.length > 0 || selDayFolga) ? (
            selDayBlockReason
              ? <Text style={[s.selDayEmpty, { color: C.error, fontStyle: 'normal' }]}>Bloqueado: {selDayBlockReason}</Text>
              : <Text style={s.selDayEmpty}>sem eventos</Text>
          ) : (
            <>
            {selDayFolga && (
              <View style={s.selDayChip}>
                <View style={[s.selDayDot, { backgroundColor: C.warning }]} />
                <Text style={s.selDayChipText}>Folga</Text>
              </View>
            )}
            {selDayTypes.map(t => (
              <View key={`t${t}`} style={s.selDayChip}>
                <View style={[s.selDayDot, { backgroundColor: SHIFT_TYPE_COLOR[t] || C.primary }]} />
                <Text style={s.selDayChipText}>Plantão {TURNOS.find(x => x.key === t)?.label || t}</Text>
              </View>
            ))}
            {selDayBlocks.map(b => (
              <View key={b.id} style={s.selDayChip}>
                <View style={[s.selDayDot, { backgroundColor: b.color || C.warning }]} />
                <Text style={s.selDayChipText}>{b.label}{b.mode === 'time' ? ` ${b.startTime}–${b.endTime}` : ''}</Text>
              </View>
            ))}
            {selDayEvents.map(e => (
              <View key={e.id} style={s.selDayChip}>
                <View style={[s.selDayDot, { backgroundColor: e.color || C.info }]} />
                <Text style={s.selDayChipText}>{e.label}{e.mode === 'time' ? ` ${e.startTime}–${e.endTime}` : ` (${(e.turnos || []).map(t => TURNOS.find(x => x.key === t)?.label || t).join(', ')})`}</Text>
              </View>
            ))}
            </>
          )}
        </View>
      </View>

      {/* Testar encaixe no dia selecionado */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Simular plantão</Text>
        <Text style={s.cardHint}>Em {_fmtDate(testDate)} — toque nos turnos que quer testar.</Text>

        <View style={s.turnoRow}>
          {TURNOS.map(t => {
            const active = testTurnos.includes(t.key);
            const occupied = selDayTypes.includes(t.key);
            return (
              <Pressable key={t.key} onPress={() => toggleTestTurno(t.key)} style={[s.turnoChip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[s.turnoText, active && { color: '#fff' }]}>{t.label}</Text>
                {occupied && <Text style={[s.turnoTag, active && { color: '#fff' }]}>já tem</Text>}
              </Pressable>
            );
          })}
        </View>

        {testResults.map(r => {
          const v = verdictStyle(r.verdict);
          return (
            <View key={r.turno} style={[s.turnoResult, { borderLeftColor: v.color }]}>
              <View style={s.turnoResultHead}>
                <Text style={s.turnoResultLabel}>{r.label}</Text>
                <View style={[s.turnoResultPill, { backgroundColor: v.bg }]}>
                  <Ionicons name={v.icon} size={13} color={v.color} />
                  <Text style={[s.turnoResultPillText, { color: v.color }]}>{v.text}</Text>
                </View>
              </View>
              {(r.violations || []).map((vi, i) => (
                <Text key={i} style={[s.resultReason, { color: reasonColor(vi.severity) }]}>• {vi.message}</Text>
              ))}
            </View>
          );
        })}
      </View>


      {/* Bater a meta de horas */}
      {targetHours > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Bater a meta</Text>
          {gapMin === 0 ? (
            <Text style={[s.cardHint, { color: C.money }]}>
              Meta de {targetHours}h batida — {formatMinutes(scheduledMin)} agendadas. 🎉
            </Text>
          ) : (
            <>
              <Text style={s.cardHint}>
                {formatMinutes(scheduledMin)} de {targetHours}h · faltam {formatMinutes(gapMin)}.
              </Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.min(100, (scheduledMin / (targetHours * 60)) * 100)}%` }]} />
              </View>
              {suggestions.length === 0 ? (
                <Text style={[s.cardHint, { marginTop: Spacing.sm }]}>
                  Nenhum dia livre seguro neste mês — reveja seus compromissos.
                </Text>
              ) : (
                <>
                  <Text style={[s.cardHint, { marginTop: Spacing.sm }]}>Dias bons pra completar:</Text>
                  {suggestions.slice(0, 8).map(({ dateKey, safeTurnos, opening }) => (
                    <Pressable key={dateKey} style={s.suggestRow} onPress={() => setTestDate(dateKey)}>
                      <View style={[s.suggestDot, { backgroundColor: C.money }]} />
                      <Text style={s.suggestDate}>{_fmtDate(dateKey)}</Text>
                      <Text style={s.suggestTurnos}>{safeTurnos.map(t => TURNOS.find(x => x.key === t)?.label || t).join(' / ')}</Text>
                      {opening && (
                        <View style={s.suggestVaga}>
                          <Ionicons name="megaphone-outline" size={12} color={C.money} />
                          <Text style={s.suggestVagaText}>vaga</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                  {ranked.some(r => r.evaluation.verdict !== VERDICT.BLOCKED) && (
                    <Pressable style={s.suggestLink} onPress={() => navigation?.navigate?.((user?.source === 'aurora' || user?.auroraOnlyMode) ? 'OpeningsScreen' : 'NetworkVacanciesScreen')}>
                      <Text style={s.suggestLinkText}>Ver vagas abertas</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.primary} />
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
        </View>
      )}


      {/* Vagas avaliadas */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Vagas avaliadas</Text>
        {ranked.length === 0 ? (
          <Text style={s.cardHint}>Nenhuma vaga disponível nos seus grupos agora.</Text>
        ) : (
          ranked.map(({ opening, interval, evaluation }) => {
            const v = verdictStyle(evaluation.verdict);
            return (
              <View key={opening.id} style={s.vagaRow}>
                <View style={[s.vagaBadge, { backgroundColor: v.bg }]}>
                  <Text style={[s.vagaBadgeText, { color: v.color }]}>{interval?.label || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vagaDate}>{_fmtDate(interval?.dateKey)}</Text>
                  <Text style={s.vagaGroup} numberOfLines={1}>{opening.group?.name || 'Plantão'}</Text>
                  {evaluation.violations?.[0] && (
                    <Text style={[s.vagaReason, { color: reasonColor(evaluation.violations[0].severity) }]} numberOfLines={2}>{evaluation.violations[0].message}</Text>
                  )}
                </View>
                <View style={[s.vagaPill, { backgroundColor: v.bg }]}>
                  <Ionicons name={v.icon} size={13} color={v.color} />
                  <Text style={[s.vagaPillText, { color: v.color }]}>{v.text}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background.secondary },
  center: { alignItems: 'center', justifyContent: 'center' },

  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  introText: { flex: 1, fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.regular, color: C.text.secondary },

  card: {
    backgroundColor: C.background.elevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 0.5,
    borderColor: C.border.light,
    padding: Spacing.card,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  cardTitle: { fontSize: Typography.fontSize.headline, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  cardHint: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, marginTop: 2 },

  statsRow: { flexDirection: 'row', marginTop: Spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: Typography.fontSize.title2, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
  statLabel: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.regular, color: C.text.tertiary, textAlign: 'center', marginTop: 2 },

  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, marginTop: Spacing.sm },
  alertText: { flex: 1, fontSize: Typography.fontSize.footnote, color: C.text.secondary },

  // Calendário
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  calTitle: { fontSize: Typography.fontSize.headline, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  calWeekRow: { flexDirection: 'row', marginBottom: Spacing.xs },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.caption2, color: C.text.tertiary, fontFamily: Typography.fontFamily.semiBold },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
  calDay: { width: '100%', height: '100%', borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderColor: 'transparent' },
  calDayNum: { fontSize: Typography.fontSize.subhead, color: C.text.primary, fontFamily: Typography.fontFamily.regular },
  calDots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2, alignItems: 'center' },
  calDot: { width: 5, height: 5, borderRadius: 2.5 },
  calDotBlock: { borderRadius: 1 }, // quadradinho pra diferenciar compromisso
  calVagaDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, backgroundColor: 'transparent' }, // anel = vaga aberta
  calLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.md, flexWrap: 'wrap' },
  calLegendText: { fontSize: Typography.fontSize.caption2, color: C.text.tertiary },
  calSwatch: { width: 12, height: 12, borderRadius: 3 },

  // O que tem no dia (legenda compacta abaixo do calendário)
  selDayBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 0.5, borderTopColor: C.border.light },
  selDayLabel: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  selDayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.background.secondary, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.pill },
  selDayDot: { width: 7, height: 7, borderRadius: 3.5 },
  selDayChipText: { fontSize: Typography.fontSize.caption1, color: C.text.secondary },
  selDayEmpty: { fontSize: Typography.fontSize.footnote, color: C.text.tertiary, fontStyle: 'italic' },

  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.background.secondary, marginTop: Spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: C.money },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs, marginTop: Spacing.xs },
  suggestDot: { width: 7, height: 7, borderRadius: 3.5 },
  suggestDate: { fontSize: Typography.fontSize.subhead, color: C.text.primary, fontFamily: Typography.fontFamily.semiBold },
  suggestTurnos: { flex: 1, fontSize: Typography.fontSize.footnote, color: C.text.secondary },
  suggestVaga: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.moneySoft, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.pill },
  suggestVagaText: { fontSize: Typography.fontSize.caption2, color: C.money, fontFamily: Typography.fontFamily.semiBold },
  suggestLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: Spacing.sm },
  suggestLinkText: { fontSize: Typography.fontSize.subhead, color: C.primary, fontFamily: Typography.fontFamily.semiBold },

  turnoRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  turnoChip: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 0.5, borderColor: C.border.light, alignItems: 'center', backgroundColor: C.background.primary },
  turnoText: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },
  turnoTag: { fontSize: Typography.fontSize.caption3, color: C.text.tertiary, marginTop: 1 },

  turnoResult: { marginTop: Spacing.md, paddingLeft: Spacing.md, borderLeftWidth: 3 },
  turnoResultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  turnoResultLabel: { fontSize: Typography.fontSize.body, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  turnoResultPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.pill },
  turnoResultPillText: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.semiBold },
  resultReason: { fontSize: Typography.fontSize.footnote, color: C.text.secondary, marginTop: Spacing.xs },

  vagaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  vagaBadge: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  vagaBadgeText: { fontSize: Typography.fontSize.body, fontFamily: Typography.fontFamily.bold },
  vagaDate: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  vagaGroup: { fontSize: Typography.fontSize.footnote, color: C.text.secondary },
  vagaReason: { fontSize: Typography.fontSize.caption1, marginTop: 1 },
  vagaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.pill },
  vagaPillText: { fontSize: Typography.fontSize.caption2, fontFamily: Typography.fontFamily.semiBold },

  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: C.background.elevated, borderRadius: BorderRadius.lg, borderWidth: 0.5, borderColor: C.border.light,
    padding: Spacing.card, ...Shadows.small,
    marginBottom: Spacing.md,
  },
  manageText: { flex: 1, fontSize: Typography.fontSize.body, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
});
