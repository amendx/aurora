/**
 * Aura (IA do Aurora) — disponibilidade.
 *
 * Gerencia o que o motor de conselho usa:
 *   - Compromissos fixos semanais (turnos bloqueados num dia da semana).
 *   - Folgas (intervalos de datas sem plantão).
 *   - Regras de fadiga (descanso, horas seguidas, dias seguidos).
 *
 * Sub-tela overlay: sem header próprio (injetado pelo MainScreen).
 */

import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import {
  loadAvailability, saveAvailability,
  addBlock, removeBlock, addFolga, removeFolga, addEvent, removeEvent, setRules, setTarget, setAvoidWeekend, setMonthEndCutoff,
  COMPROMISSO_COLORS,
} from '../utils/AvailabilityConfig';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TURNOS = [
  { key: 'M', label: 'Manhã' },
  { key: 'T', label: 'Tarde' },
  { key: 'N', label: 'Noite' },
];

const _todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const _addDays = (dateKey, n) => {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const _fmtBr = (dateKey) => {
  const d = new Date(`${dateKey}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const _nextDays = (n) => Array.from({ length: n }, (_, i) => _addDays(_todayKey(), i));

export default function AuraAvailabilityScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [config, setConfig] = useState(null);

  // form: compromisso fixo (por turno ou por horário)
  const [bWeekday, setBWeekday] = useState(1);
  const [bMode, setBMode] = useState('turno'); // 'turno' | 'time'
  const [bTurnos, setBTurnos] = useState([]);
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bLabel, setBLabel] = useState('');
  const [bColor, setBColor] = useState(COMPROMISSO_COLORS[0]);

  // form: folga
  const [fStart, setFStart] = useState(_todayKey());
  const [fDays, setFDays] = useState(1);
  const [fLabel, setFLabel] = useState('');

  // form: evento pontual (data + turno/horário)
  const [evDate, setEvDate] = useState(_todayKey());
  const [evMode, setEvMode] = useState('turno');
  const [evTurnos, setEvTurnos] = useState([]);
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');
  const [evLabel, setEvLabel] = useState('');
  const [evColor, setEvColor] = useState(COMPROMISSO_COLORS[2]);

  useEffect(() => {
    if (!userId) return;
    loadAvailability(userId).then(setConfig);
  }, [userId]);

  const persist = useCallback((next) => {
    setConfig(next);
    if (userId) saveAvailability(userId, next);
  }, [userId]);

  // Detecta plantões nos dias de folga (pra avisar que precisam ser passados).
  const { loadMonthlyShifts, getMonthCache, currentMonth, currentYear, daysWithShifts } = useShifts();
  const folgaMonths = useMemo(() => {
    const map = new Map();
    (config?.folgas || []).forEach(f => {
      if (!f.startDate || !f.endDate) return;
      let cur = new Date(`${f.startDate.slice(0, 7)}-01T00:00:00`);
      const endM = f.endDate.slice(0, 7);
      while (`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}` <= endM) {
        map.set(`${cur.getFullYear()}-${cur.getMonth() + 1}`, { m: cur.getMonth() + 1, y: cur.getFullYear() });
        cur.setMonth(cur.getMonth() + 1);
      }
    });
    return [...map.values()];
  }, [config]);

  // Carrega os meses das folgas. Deps só folgaMonths — NÃO a identidade de
  // loadMonthlyShifts (muda a cada render do ShiftsContext → loop de Firebase).
  useEffect(() => {
    folgaMonths.forEach(({ m, y }) => loadMonthlyShifts?.(m, y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folgaMonths]);

  const shiftDates = useMemo(() => {
    const set = new Set();
    folgaMonths.forEach(({ m, y }) => {
      const days = getMonthCache?.(m, y)?.daysWithShifts
        || ((currentMonth === m && currentYear === y) ? daysWithShifts : []);
      (days || []).forEach(d => { if ((d.shifts || []).length) set.add(d.date); });
    });
    return set;
  }, [folgaMonths, getMonthCache, currentMonth, currentYear, daysWithShifts]);

  if (!config) {
    return <View style={[s.root, s.center]}><ActivityIndicator color={C.primary} /></View>;
  }

  const folgaConflicts = (f) => {
    const out = [];
    if (!f.startDate || !f.endDate) return out;
    let d = new Date(`${f.startDate}T00:00:00`);
    const end = new Date(`${f.endDate}T00:00:00`);
    while (d <= end) {
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (shiftDates.has(dk)) out.push(dk);
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  const toggleTurno = (k) =>
    setBTurnos(prev => prev.includes(k) ? prev.filter(t => t !== k) : [...prev, k]);

  const _validTime = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim());
  const blockReady = bMode === 'turno' ? bTurnos.length > 0 : (_validTime(bStart) && _validTime(bEnd));

  const handleAddBlock = () => {
    if (!blockReady) return;
    const base = { weekday: bWeekday, label: bLabel.trim() || 'Compromisso', color: bColor };
    const block = bMode === 'turno'
      ? { ...base, mode: 'turno', turnos: bTurnos }
      : { ...base, mode: 'time', startTime: bStart.trim(), endTime: bEnd.trim() };
    persist(addBlock(config, block));
    setBTurnos([]); setBStart(''); setBEnd(''); setBLabel('');
  };

  const handleAddFolga = () => {
    const endDate = _addDays(fStart, Math.max(1, fDays) - 1);
    persist(addFolga(config, { startDate: fStart, endDate, label: fLabel.trim() || 'Folga' }));
    setFLabel('');
  };

  const toggleEvTurno = (k) =>
    setEvTurnos(prev => prev.includes(k) ? prev.filter(t => t !== k) : [...prev, k]);
  const eventReady = evMode === 'turno' ? evTurnos.length > 0 : (_validTime(evStart) && _validTime(evEnd));
  const handleAddEvent = () => {
    if (!eventReady) return;
    const base = { date: evDate, label: evLabel.trim() || 'Evento', color: evColor };
    const event = evMode === 'turno'
      ? { ...base, mode: 'turno', turnos: evTurnos }
      : { ...base, mode: 'time', startTime: evStart.trim(), endTime: evEnd.trim() };
    persist(addEvent(config, event));
    setEvTurnos([]); setEvStart(''); setEvEnd(''); setEvLabel('');
  };

  const rules = config.rules || {};
  const updateRule = (patch) => persist(setRules(config, patch));

  return (
    <ScrollView
      style={s.root}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + Spacing.xl }}
    >
      {/* ── Compromissos fixos ── */}
      <Text style={s.sectionTitle}>Compromissos fixos</Text>
      <Text style={s.sectionHint}>Quando você não pega plantão na semana (esporte, terapia…). Por turno inteiro ou por horário.</Text>

      <View style={s.card}>
        {(config.recurringBlocks || []).length === 0 && (
          <Text style={s.empty}>Nenhum compromisso fixo.</Text>
        )}
        {(config.recurringBlocks || []).map(b => (
          <View key={b.id} style={s.itemRow}>
            <View style={[s.colorTag, { backgroundColor: b.color || C.warning }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{b.label}</Text>
              <Text style={s.itemSub}>
                {WEEKDAYS[b.weekday]} · {b.mode === 'time'
                  ? `${b.startTime}–${b.endTime}`
                  : (b.turnos || []).map(t => TURNOS.find(x => x.key === t)?.label || t).join(', ')}
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={() => persist(removeBlock(config, b.id))}>
              <Ionicons name="trash-outline" size={18} color={C.error} />
            </Pressable>
          </View>
        ))}

        <View style={s.divider} />

        <Text style={s.formLabel}>Dia da semana</Text>
        <View style={s.wdRow}>
          {WEEKDAYS.map((w, i) => {
            const active = i === bWeekday;
            return (
              <Pressable key={w} onPress={() => setBWeekday(i)} style={[s.wdChip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[s.wdText, active && { color: '#fff' }]}>{w}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.formLabel}>Como bloquear</Text>
        <View style={s.turnoRow}>
          {[{ k: 'turno', l: 'Por turno' }, { k: 'time', l: 'Por horário' }].map(opt => {
            const active = bMode === opt.k;
            return (
              <Pressable key={opt.k} onPress={() => setBMode(opt.k)} style={[s.turnoChip, active && { backgroundColor: C.accentSoft, borderColor: C.primary }]}>
                <Text style={[s.turnoText, active && { color: C.primary }]}>{opt.l}</Text>
              </Pressable>
            );
          })}
        </View>

        {bMode === 'turno' ? (
          <>
            <Text style={s.formLabel}>Turnos</Text>
            <View style={s.turnoRow}>
              {TURNOS.map(t => {
                const active = bTurnos.includes(t.key);
                return (
                  <Pressable key={t.key} onPress={() => toggleTurno(t.key)} style={[s.turnoChip, active && { backgroundColor: C.accentSoft, borderColor: C.primary }]}>
                    <Text style={[s.turnoText, active && { color: C.primary }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={s.formLabel}>Horário (HH:mm)</Text>
            <View style={s.timeRow}>
              <TextInput style={[s.input, s.timeInput]} placeholder="18:00" placeholderTextColor={C.text.tertiary} value={bStart} onChangeText={setBStart} keyboardType="numbers-and-punctuation" />
              <Text style={s.timeSep}>até</Text>
              <TextInput style={[s.input, s.timeInput]} placeholder="20:00" placeholderTextColor={C.text.tertiary} value={bEnd} onChangeText={setBEnd} keyboardType="numbers-and-punctuation" />
            </View>
          </>
        )}

        <Text style={s.formLabel}>Cor</Text>
        <View style={s.colorRow}>
          {COMPROMISSO_COLORS.map(c => (
            <Pressable key={c} onPress={() => setBColor(c)} style={[s.colorDot, { backgroundColor: c }, bColor === c && s.colorDotActive]}>
              {bColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          ))}
        </View>

        <TextInput
          style={s.input}
          placeholder="Rótulo (ex.: Terapia)"
          placeholderTextColor={C.text.tertiary}
          value={bLabel}
          onChangeText={setBLabel}
        />

        <Pressable style={[s.addBtn, !blockReady && s.addBtnDisabled]} onPress={handleAddBlock} disabled={!blockReady}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Adicionar compromisso</Text>
        </Pressable>
      </View>

      {/* ── Folgas ── */}
      <Text style={s.sectionTitle}>Folgas</Text>
      <Text style={s.sectionHint}>Períodos de 1+ dias sem pegar plantão (viagem…). Se já tiver plantão num dia de folga, passe-o (ceder/trocar).</Text>

      <View style={s.card}>
        {(config.folgas || []).length === 0 && (
          <Text style={s.empty}>Nenhuma folga.</Text>
        )}
        {(config.folgas || []).map(f => {
          const conflicts = folgaConflicts(f);
          return (
            <View key={f.id} style={s.folgaItem}>
              <View style={s.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{f.label}</Text>
                  <Text style={s.itemSub}>{_fmtBr(f.startDate)} – {_fmtBr(f.endDate)}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => persist(removeFolga(config, f.id))}>
                  <Ionicons name="trash-outline" size={18} color={C.error} />
                </Pressable>
              </View>
              {conflicts.length > 0 && (
                <View style={s.conflictRow}>
                  <Ionicons name="warning-outline" size={14} color={C.warning} />
                  <Text style={s.conflictText}>
                    Você tem plantão em {conflicts.map(_fmtBr).join(', ')} — passe-o (ceder/trocar) antes da folga.
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={s.divider} />

        <Text style={s.formLabel}>Início</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {_nextDays(30).map(dk => {
            const active = dk === fStart;
            const d = new Date(`${dk}T00:00:00`);
            return (
              <Pressable key={dk} onPress={() => setFStart(dk)} style={[s.dayChip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[s.dayChipWd, active && { color: '#fff' }]}>{WEEKDAYS[d.getDay()]}</Text>
                <Text style={[s.dayChipNum, active && { color: '#fff' }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.stepperRow}>
          <Text style={s.formLabel}>Duração: {fDays} {fDays === 1 ? 'dia' : 'dias'}</Text>
          <View style={s.stepper}>
            <Pressable style={s.stepBtn} onPress={() => setFDays(d => Math.max(1, d - 1))}><Ionicons name="remove" size={18} color={C.primary} /></Pressable>
            <Pressable style={s.stepBtn} onPress={() => setFDays(d => d + 1)}><Ionicons name="add" size={18} color={C.primary} /></Pressable>
          </View>
        </View>
        <Text style={s.itemSub}>Até {_fmtBr(_addDays(fStart, Math.max(1, fDays) - 1))}</Text>

        <TextInput
          style={s.input}
          placeholder="Rótulo (ex.: Viagem)"
          placeholderTextColor={C.text.tertiary}
          value={fLabel}
          onChangeText={setFLabel}
        />

        <Pressable style={s.addBtn} onPress={handleAddFolga}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Adicionar folga</Text>
        </Pressable>
      </View>

      {/* ── Eventos pontuais ── */}
      <Text style={s.sectionTitle}>Eventos</Text>
      <Text style={s.sectionHint}>Compromisso de um dia só (festa, viagem curta…): escolha a data e o turno/horário.</Text>

      <View style={s.card}>
        {(config.events || []).length === 0 && (
          <Text style={s.empty}>Nenhum evento.</Text>
        )}
        {(config.events || []).map(e => (
          <View key={e.id} style={s.itemRow}>
            <View style={[s.colorTag, { backgroundColor: e.color || C.info }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{e.label}</Text>
              <Text style={s.itemSub}>
                {_fmtBr(e.date)} · {e.mode === 'time'
                  ? `${e.startTime}–${e.endTime}`
                  : (e.turnos || []).map(t => TURNOS.find(x => x.key === t)?.label || t).join(', ')}
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={() => persist(removeEvent(config, e.id))}>
              <Ionicons name="trash-outline" size={18} color={C.error} />
            </Pressable>
          </View>
        ))}

        <View style={s.divider} />

        <Text style={s.formLabel}>Data</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {_nextDays(60).map(dk => {
            const active = dk === evDate;
            const d = new Date(`${dk}T00:00:00`);
            return (
              <Pressable key={dk} onPress={() => setEvDate(dk)} style={[s.dayChip, active && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[s.dayChipWd, active && { color: '#fff' }]}>{WEEKDAYS[d.getDay()]}</Text>
                <Text style={[s.dayChipNum, active && { color: '#fff' }]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={s.formLabel}>Como bloquear</Text>
        <View style={s.turnoRow}>
          {[{ k: 'turno', l: 'Por turno' }, { k: 'time', l: 'Por horário' }].map(opt => {
            const active = evMode === opt.k;
            return (
              <Pressable key={opt.k} onPress={() => setEvMode(opt.k)} style={[s.turnoChip, active && { backgroundColor: C.accentSoft, borderColor: C.primary }]}>
                <Text style={[s.turnoText, active && { color: C.primary }]}>{opt.l}</Text>
              </Pressable>
            );
          })}
        </View>

        {evMode === 'turno' ? (
          <>
            <Text style={s.formLabel}>Turnos</Text>
            <View style={s.turnoRow}>
              {TURNOS.map(t => {
                const active = evTurnos.includes(t.key);
                return (
                  <Pressable key={t.key} onPress={() => toggleEvTurno(t.key)} style={[s.turnoChip, active && { backgroundColor: C.accentSoft, borderColor: C.primary }]}>
                    <Text style={[s.turnoText, active && { color: C.primary }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={s.formLabel}>Horário (HH:mm)</Text>
            <View style={s.timeRow}>
              <TextInput style={[s.input, s.timeInput]} placeholder="20:00" placeholderTextColor={C.text.tertiary} value={evStart} onChangeText={setEvStart} keyboardType="numbers-and-punctuation" />
              <Text style={s.timeSep}>até</Text>
              <TextInput style={[s.input, s.timeInput]} placeholder="23:00" placeholderTextColor={C.text.tertiary} value={evEnd} onChangeText={setEvEnd} keyboardType="numbers-and-punctuation" />
            </View>
          </>
        )}

        <Text style={s.formLabel}>Cor</Text>
        <View style={s.colorRow}>
          {COMPROMISSO_COLORS.map(c => (
            <Pressable key={c} onPress={() => setEvColor(c)} style={[s.colorDot, { backgroundColor: c }, evColor === c && s.colorDotActive]}>
              {evColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          ))}
        </View>

        <TextInput
          style={s.input}
          placeholder="Rótulo (ex.: Festa)"
          placeholderTextColor={C.text.tertiary}
          value={evLabel}
          onChangeText={setEvLabel}
        />

        <Pressable style={[s.addBtn, !eventReady && s.addBtnDisabled]} onPress={handleAddEvent} disabled={!eventReady}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Adicionar evento</Text>
        </Pressable>
      </View>

      {/* ── Meta de horas ── */}
      <Text style={s.sectionTitle}>Meta de horas/mês</Text>
      <Text style={s.sectionHint}>Sua fidelização. O Aura pinta de verde os dias bons pra completar. 0 = sem meta.</Text>

      <View style={s.card}>
        <RuleStepper
          C={C} s={s}
          label="Meta mensal"
          value={config.targetHours ? `${config.targetHours}h` : '—'}
          onMinus={() => persist(setTarget(config, (config.targetHours || 0) - 12))}
          onPlus={() => persist(setTarget(config, (config.targetHours || 0) + 12))}
          last
        />
      </View>

      {/* ── Preferências ── */}
      <Text style={s.sectionTitle}>Preferências</Text>
      <Text style={s.sectionHint}>Ajustes de como o Aura sugere encaixes.</Text>

      <View style={s.card}>
        <View style={[s.switchRow, s.switchRowBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle}>Evitar fim de semana</Text>
            <Text style={s.itemSub}>Sexta à noite, sábado e domingo viram “arriscado”.</Text>
          </View>
          <Switch
            value={!!config.avoidWeekend}
            onValueChange={(v) => persist(setAvoidWeekend(config, v))}
            trackColor={{ true: C.primary }}
          />
        </View>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle}>Noite do fim do mês conta meia</Text>
            <Text style={s.itemSub}>N do último dia conta só até a meia-noite (ex.: 19h–07h = 5h) na meta de horas.</Text>
          </View>
          <Switch
            value={!!config.monthEndNightCutoff}
            onValueChange={(v) => persist(setMonthEndCutoff(config, v))}
            trackColor={{ true: C.primary }}
          />
        </View>
      </View>

      {/* ── Regras de fadiga ── */}
      <Text style={s.sectionTitle}>Regras de fadiga</Text>
      <Text style={s.sectionHint}>Limites que o Aura usa para alertar.</Text>

      <View style={s.card}>
        <RuleStepper
          C={C} s={s}
          label="Descanso mínimo entre plantões"
          value={`${Math.round((rules.minRestMinutes || 0) / 60)}h`}
          onMinus={() => updateRule({ minRestMinutes: Math.max(0, (rules.minRestMinutes || 0) - 60) })}
          onPlus={() => updateRule({ minRestMinutes: (rules.minRestMinutes || 0) + 60 })}
        />
        <RuleStepper
          C={C} s={s}
          label="Máximo de horas seguidas"
          value={`${Math.round((rules.maxConsecutiveMinutes || 0) / 60)}h`}
          onMinus={() => updateRule({ maxConsecutiveMinutes: Math.max(60, (rules.maxConsecutiveMinutes || 0) - 60) })}
          onPlus={() => updateRule({ maxConsecutiveMinutes: (rules.maxConsecutiveMinutes || 0) + 60 })}
        />
        <RuleStepper
          C={C} s={s}
          label="Máximo de dias seguidos"
          value={`${rules.maxConsecutiveDays || 0}`}
          onMinus={() => updateRule({ maxConsecutiveDays: Math.max(1, (rules.maxConsecutiveDays || 0) - 1) })}
          onPlus={() => updateRule({ maxConsecutiveDays: (rules.maxConsecutiveDays || 0) + 1 })}
          last
        />
      </View>
    </ScrollView>
  );
}

function RuleStepper({ C, s, label, value, onMinus, onPlus, last }) {
  return (
    <View style={[s.ruleRow, !last && s.ruleRowBorder]}>
      <Text style={s.ruleLabel}>{label}</Text>
      <View style={s.stepper}>
        <Pressable style={s.stepBtn} onPress={onMinus}><Ionicons name="remove" size={18} color={C.primary} /></Pressable>
        <Text style={s.ruleValue}>{value}</Text>
        <Pressable style={s.stepBtn} onPress={onPlus}><Ionicons name="add" size={18} color={C.primary} /></Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background.secondary },
  center: { alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: Typography.fontSize.headline, fontFamily: Typography.fontFamily.bold, color: C.text.primary, marginTop: Spacing.sm },
  sectionHint: { fontSize: Typography.fontSize.footnote, color: C.text.tertiary, marginTop: 2, marginBottom: Spacing.sm },

  card: {
    backgroundColor: C.background.elevated, borderRadius: BorderRadius.lg, borderWidth: 0.5, borderColor: C.border.light,
    padding: Spacing.card, marginBottom: Spacing.lg, ...Shadows.small,
  },
  empty: { fontSize: Typography.fontSize.subhead, color: C.text.tertiary },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  switchRowBorder: { borderBottomWidth: 0.5, borderBottomColor: C.border.light },
  folgaItem: {},
  conflictRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, paddingBottom: Spacing.sm, paddingLeft: 2 },
  conflictText: { flex: 1, fontSize: Typography.fontSize.footnote, color: C.warning },
  colorTag: { width: 10, height: 28, borderRadius: 3 },
  colorRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  colorDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 2, borderColor: C.text.primary },
  itemTitle: { fontSize: Typography.fontSize.body, fontFamily: Typography.fontFamily.semiBold, color: C.text.primary },
  itemSub: { fontSize: Typography.fontSize.footnote, color: C.text.secondary, marginTop: 1 },

  divider: { height: 0.5, backgroundColor: C.border.light, marginVertical: Spacing.md },

  formLabel: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },

  wdRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  wdChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: BorderRadius.sm, borderWidth: 0.5, borderColor: C.border.light, backgroundColor: C.background.primary },
  wdText: { fontSize: Typography.fontSize.footnote, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },

  turnoRow: { flexDirection: 'row', gap: Spacing.sm },
  turnoChip: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 0.5, borderColor: C.border.light, alignItems: 'center', backgroundColor: C.background.primary },
  turnoText: { fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.semiBold, color: C.text.secondary },

  dayChip: { width: 48, height: 56, borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: C.border.light, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm, backgroundColor: C.background.primary },
  dayChipWd: { fontSize: Typography.fontSize.caption2, color: C.text.tertiary },
  dayChipNum: { fontSize: Typography.fontSize.body, color: C.text.primary, fontFamily: Typography.fontFamily.semiBold },

  input: {
    marginTop: Spacing.md, borderWidth: 0.5, borderColor: C.border.medium, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: Typography.fontSize.body, color: C.text.primary,
    fontFamily: Typography.fontFamily.regular,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeInput: { flex: 1, textAlign: 'center' },
  timeSep: { fontSize: Typography.fontSize.subhead, color: C.text.tertiary, marginTop: Spacing.md },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.primary, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm, marginTop: Spacing.md,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: Typography.fontSize.subhead, fontFamily: Typography.fontFamily.semiBold },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepBtn: { width: 34, height: 34, borderRadius: BorderRadius.sm, borderWidth: 0.5, borderColor: C.border.light, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background.primary },

  ruleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  ruleRowBorder: { borderBottomWidth: 0.5, borderBottomColor: C.border.light },
  ruleLabel: { flex: 1, fontSize: Typography.fontSize.subhead, color: C.text.primary, fontFamily: Typography.fontFamily.regular },
  ruleValue: { minWidth: 44, textAlign: 'center', fontSize: Typography.fontSize.body, fontFamily: Typography.fontFamily.bold, color: C.text.primary },
});
