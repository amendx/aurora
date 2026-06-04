/**
 * Aura (IA do Aurora) — motor de conselho de escala.
 *
 * Função pura, determinística. SEM React, SEM rede, SEM I/O — só matemática
 * sobre os plantões já carregados e a disponibilidade do médico.
 * Toda duração em MINUTOS INTEIROS internamente (regra dura do projeto);
 * horas só na renderização (a cargo da UI).
 *
 * É também o seam para uma futura camada LLM: ela consumiria os mesmos
 * "features" computados aqui (intervalos, gaps, sequências, violações) sem
 * precisar mudar o motor. Ver buildAuraContext() no fim.
 */

import TimeUtils from './TimeUtils';
import { DEFAULT_RULES } from './AvailabilityConfig';

const MIN = 60_000;        // ms por minuto
const DAY_MIN = 24 * 60;   // minutos por dia

// Veredito de um candidato a plantão.
export const VERDICT = { SAFE: 'safe', RISKY: 'risky', BLOCKED: 'blocked' };
const VERDICT_ORDER = { safe: 0, risky: 1, blocked: 2 };

// Horários padrão por turno, usados quando o candidato é hipotético (sem horário).
export const DEFAULT_SHIFT_TIMES = {
  M: { startTime: '07:00', endTime: '13:00' },
  T: { startTime: '13:00', endTime: '19:00' },
  N: { startTime: '19:00', endTime: '07:00' },
};

// Encadeamento: plantões com gap ≤ este limiar contam como "horas seguidas".
const CHAIN_GAP_MIN = 120; // 2h

// ── helpers de tempo ──────────────────────────────────────────────────────────

const _localMs = (dateKey, hhmm) => {
  if (!dateKey || !hhmm) return null;
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, m] = String(hhmm).replace('h', ':').split(':').map(Number);
  if ([y, mo, d, h, m].some(n => Number.isNaN(n))) return null;
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
};

const _isoOrLocalMs = (iso, dateKey, hhmm) => {
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return _localMs(dateKey, hhmm);
};

const _minOfDay = (ms) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

const fmtH = (minutes) => {
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}min`;
  if (rest === 0) return `${h}h`;
  return `${h}h${String(rest).padStart(2, '0')}`;
};

const _hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
};
const _ddmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Descrição enxuta de um plantão para as mensagens: "plantão M · GRUPO (10/06)".
const _describe = (iv) => {
  if (!iv) return 'plantão';
  const grp = iv.groupName ? ` · ${iv.groupName}` : '';
  return `plantão ${iv.label || '?'}${grp} (${_ddmm(iv.startMs)})`;
};

const TURNO_ORDER = { M: 0, T: 1, N: 2 };

// ── intervalos ─────────────────────────────────────────────────────────────────

/**
 * Converte um plantão em intervalo absoluto { startMs, endMs, dateKey, label }.
 * Aceita tanto startTime/endTime ("HH:mm") quanto startISO/endISO.
 * @returns {{startMs:number,endMs:number,dateKey:string,label:string,durationMinutes:number}|null}
 */
export const shiftToInterval = (shift) => {
  if (!shift) return null;
  const dateKey = shift.date || (shift.startISO || '').slice(0, 10);
  if (!dateKey) return null;
  const label = (shift.label || '').charAt(0).toUpperCase();

  let startMs = _isoOrLocalMs(shift.startISO, dateKey, shift.startTime);
  let endMs = _isoOrLocalMs(shift.endISO, dateKey, shift.endTime);
  if (startMs == null) return null;

  if (endMs != null && endMs <= startMs) endMs += DAY_MIN * MIN; // cruza meia-noite
  if (endMs == null) {
    const dur = shift.durationMinutes || TimeUtils.getShiftStandardMinutes(label);
    endMs = startMs + dur * MIN;
  }
  return {
    startMs,
    endMs,
    dateKey,
    label,
    groupName: shift.group?.name || null,
    durationMinutes: Math.round((endMs - startMs) / MIN),
  };
};

/** Vaga (opening) → intervalo. Vagas já têm startISO/endISO. */
export const openingToInterval = (opening) =>
  shiftToInterval({
    date: opening?.dateKey,
    startISO: opening?.startISO,
    endISO: opening?.endISO,
    label: opening?.label,
    group: opening?.group,
    durationMinutes: opening?.durationMinutes,
  });

/** Candidato hipotético a partir de dia + turno (M/T/N). */
export const candidateFromSlot = (dateKey, label) => {
  const t = DEFAULT_SHIFT_TIMES[(label || '').charAt(0).toUpperCase()];
  if (!t) return null;
  return shiftToInterval({ date: dateKey, label, startTime: t.startTime, endTime: t.endTime });
};

// ── bloqueios / folgas ──────────────────────────────────────────────────────────

/**
 * O candidato cai num bloqueio recorrente ou folga?
 * @returns {{blocked:boolean, reason?:string}}
 */
export const isBlocked = (interval, config) => {
  if (!interval) return { blocked: false };
  const { dateKey, label } = interval;

  // Folga: intervalo de datas inclusivo (comparação lexicográfica de YYYY-MM-DD).
  for (const f of config?.folgas || []) {
    if (f.startDate && f.endDate && dateKey >= f.startDate && dateKey <= f.endDate) {
      return { blocked: true, reason: `Folga: ${f.label || 'período bloqueado'}` };
    }
  }

  const weekday = new Date(`${dateKey}T00:00:00`).getDay(); // 0=Dom … 6=Sáb
  const startMin = _minOfDay(interval.startMs);
  let endMin = _minOfDay(interval.endMs);
  if (endMin <= startMin) endMin += DAY_MIN; // candidato cruza meia-noite

  // Compromissos fixos (semanais) + eventos pontuais (data específica) usam a
  // mesma lógica de match turno/horário; só muda o gate de data.
  const _hit = (b, fallback) => {
    if (b.mode === 'turno') {
      if ((b.turnos || []).map(t => t.charAt(0).toUpperCase()).includes(label)) {
        return { blocked: true, reason: `${b.label || fallback} neste turno` };
      }
    } else if (b.mode === 'time') {
      const [bs, be] = [b.startTime, b.endTime].map(t => {
        const [h, m] = String(t).replace('h', ':').split(':').map(Number);
        return h * 60 + m;
      });
      if (startMin < be && endMin > bs) {
        return { blocked: true, reason: `${b.label || fallback} (${b.startTime}–${b.endTime})` };
      }
    }
    return null;
  };

  for (const b of config?.recurringBlocks || []) {
    if (b.weekday !== weekday) continue;
    const hit = _hit(b, 'Compromisso');
    if (hit) return hit;
  }
  for (const e of config?.events || []) {
    if (e.date !== dateKey) continue;
    const hit = _hit(e, 'Evento');
    if (hit) return hit;
  }
  return { blocked: false };
};

/**
 * O candidato pode "transbordar" para dentro de um bloqueio logo a seguir?
 * Caso clássico: pego um T (nominal até 19h) num dia em que tenho bloqueio de N —
 * alguns hospitais estendem o T até 20h e ele invade o compromisso da noite.
 * Não bloqueia (o turno em si está livre), só alerta.
 * @returns {string|null} mensagem de risco
 */
const _blockOverflowRisk = (interval, config) => {
  if (!interval) return null;
  const weekday = new Date(`${interval.dateKey}T00:00:00`).getDay();
  const candLabel = interval.label;
  const candEndMin = _minOfDay(interval.endMs);

  for (const b of config?.recurringBlocks || []) {
    if (b.weekday !== weekday) continue;

    if (b.mode === 'turno') {
      const blocked = (b.turnos || []).map(t => t.charAt(0).toUpperCase());
      // candidato é o turno imediatamente antes de um turno bloqueado
      const isAdjacentBefore = blocked.some(bt => TURNO_ORDER[bt] === TURNO_ORDER[candLabel] + 1);
      if (isAdjacentBefore) {
        const next = blocked.find(bt => TURNO_ORDER[bt] === TURNO_ORDER[candLabel] + 1);
        return `Pegar um ${candLabel} antes do seu bloqueio de ${b.label} (${next === 'N' ? 'noite' : next === 'T' ? 'tarde' : 'turno'}) é arriscado: o plantão pode atrasar e invadir o compromisso.`;
      }
    } else if (b.mode === 'time') {
      const [bh, bm] = String(b.startTime).replace('h', ':').split(':').map(Number);
      const blockStartMin = bh * 60 + bm;
      const gap = blockStartMin - candEndMin;
      // termina no mesmo dia, até 1h antes do compromisso
      if (gap >= 0 && gap <= 60) {
        return `Este plantão termina pouco antes do seu compromisso "${b.label}" (${b.startTime}). Se atrasar, você pode perdê-lo.`;
      }
    }
  }
  return null;
};

// Slot de fim de semana a evitar (config.avoidWeekend): sáb, dom, ou sexta à noite.
const _isAvoidedWeekend = (interval, config) => {
  if (!config?.avoidWeekend || !interval) return false;
  const wd = new Date(`${interval.dateKey}T00:00:00`).getDay(); // 0=Dom … 6=Sáb
  if (wd === 6 || wd === 0) return true;               // sábado, domingo
  if (wd === 5 && interval.label === 'N') return true; // sexta à noite
  return false;
};

// ── avaliação de um candidato ────────────────────────────────────────────────────

/**
 * Avalia se encaixar `candidate` é seguro dado os plantões existentes + config.
 * @param {object} candidate          intervalo (shiftToInterval/candidateFromSlot)
 * @param {object[]} existingIntervals intervalos já na escala
 * @param {object} config             { recurringBlocks, folgas, rules }
 * @returns {{verdict:string, violations:{rule:string,severity:string,message:string}[]}}
 */
export const evaluateCandidate = (candidate, existingIntervals, config) => {
  const violations = [];
  if (!candidate) return { verdict: VERDICT.BLOCKED, violations: [{ rule: 'invalid', severity: 'block', message: 'Horário inválido' }] };

  const rules = { ...DEFAULT_RULES, ...(config?.rules || {}) };
  const others = (existingIntervals || []).filter(Boolean);

  // 1. bloqueio / folga
  const blk = isBlocked(candidate, config);
  if (blk.blocked) return { verdict: VERDICT.BLOCKED, violations: [{ rule: 'block', severity: 'block', message: blk.reason }] };

  // 2. sobreposição com plantão existente
  const ov = others.find(o => candidate.startMs < o.endMs && candidate.endMs > o.startMs);
  if (ov) return { verdict: VERDICT.BLOCKED, violations: [{ rule: 'overlap', severity: 'block', message: `Conflita com o ${_describe(ov)}` }] };

  // 3. descanso mínimo: vizinho mais próximo antes e depois do candidato
  let before = null, after = null; // { gap, iv }
  for (const o of others) {
    if (o.endMs <= candidate.startMs) {
      const gap = (candidate.startMs - o.endMs) / MIN;
      if (!before || gap < before.gap) before = { gap, iv: o };
    } else if (candidate.endMs <= o.startMs) {
      const gap = (o.startMs - candidate.endMs) / MIN;
      if (!after || gap < after.gap) after = { gap, iv: o };
    }
  }
  const beforeTight = before && before.gap < rules.minRestMinutes;
  const afterTight = after && after.gap < rules.minRestMinutes;
  // gap < 6min conta como "sem descanso" (emendado).
  const restPhrase = (gap, rel, iv) =>
    gap < 6
      ? `Sem descanso ${rel} ${_describe(iv)}`
      : `Só ${fmtH(gap)} de descanso ${rel} ${_describe(iv)}`;
  if (beforeTight && afterTight) {
    violations.push({
      rule: 'rest',
      severity: 'warn',
      message: `Imprensado entre o ${_describe(before.iv)} e o ${_describe(after.iv)} — pouco descanso dos dois lados (mínimo ${fmtH(rules.minRestMinutes)})`,
    });
  } else if (beforeTight) {
    violations.push({ rule: 'rest', severity: 'warn', message: `${restPhrase(before.gap, 'depois do', before.iv)} — mínimo ${fmtH(rules.minRestMinutes)}` });
  } else if (afterTight) {
    violations.push({ rule: 'rest', severity: 'warn', message: `${restPhrase(after.gap, 'antes do', after.iv)} — mínimo ${fmtH(rules.minRestMinutes)}` });
  }

  // 3b. risco de transbordar num bloqueio logo em seguida (ex.: T que pode ir
  // até 20h, antes de um bloqueio de N na mesma noite).
  const overflow = _blockOverflowRisk(candidate, config);
  if (overflow) violations.push({ rule: 'blockOverflow', severity: 'warn', message: overflow });

  // 3c. evitar fim de semana (sexta à noite, sábado, domingo), se ativado.
  if (_isAvoidedWeekend(candidate, config)) {
    violations.push({ rule: 'weekend', severity: 'warn', message: 'Fim de semana — você prefere evitar.' });
  }

  // 4. horas seguidas: cadeia de plantões quase emendados (gap ≤ CHAIN_GAP)
  const chain = _chain(candidate, others);
  if (chain.minutes > rules.maxConsecutiveMinutes) {
    const span = chain.count > 1
      ? ` — de ${_hhmm(chain.startMs)} ${_ddmm(chain.startMs)} a ${_hhmm(chain.endMs)} ${_ddmm(chain.endMs)}, encadeando ${chain.count} plantões`
      : '';
    violations.push({
      rule: 'consecutiveHours',
      severity: 'warn',
      message: `${fmtH(chain.minutes)} seguidas de plantão quase sem pausa (máx ${fmtH(rules.maxConsecutiveMinutes)})${span}`,
    });
  }

  // 5. dias consecutivos trabalhados — passar do máximo BLOQUEIA o dia.
  const days = _consecutiveDays(candidate.dateKey, others);
  if (days.run > rules.maxConsecutiveDays) {
    violations.push({
      rule: 'consecutiveDays',
      severity: 'block',
      message: `Passaria de ${rules.maxConsecutiveDays} dias seguidos de plantão (seriam ${days.run}: ${days.startBr}–${days.endBr})`,
    });
  }

  const hasBlock = violations.some(v => v.severity === 'block');
  const hasWarn = violations.some(v => v.severity === 'warn');

  // Nota informativa: há plantão emendado, mas dentro do limite — só avisa,
  // não rebaixa o veredito (ex.: já tenho um M e quero pôr um T no mesmo dia).
  if (!hasBlock && !hasWarn) {
    const adjacent = [];
    if (before && before.gap <= CHAIN_GAP_MIN) adjacent.push(before.iv);
    if (after && after.gap <= CHAIN_GAP_MIN) adjacent.push(after.iv);
    if (adjacent.length) {
      // `simulated` = outro turno que o usuário está testando (não é plantão real).
      const anySimulated = adjacent.some(iv => iv.simulated);
      const desc = adjacent.map(_describe).join(' e ');
      violations.push({
        rule: 'adjacent',
        severity: 'info',
        message: anySimulated
          ? `Com ${desc} por perto, ainda dá pra encaixar.`
          : `Já tem ${desc} por perto — ainda dá pra encaixar.`,
      });
    }
  }

  return { verdict: hasBlock ? VERDICT.BLOCKED : hasWarn ? VERDICT.RISKY : VERDICT.SAFE, violations };
};

// cadeia de plantões quase emendados ao candidato (gap ≤ CHAIN_GAP): soma das
// durações + extensão temporal (início/fim) + quantos plantões entram.
const _chain = (candidate, others) => {
  const all = [candidate, ...others].sort((a, b) => a.startMs - b.startMs);
  const idx = all.indexOf(candidate);
  let total = (candidate.endMs - candidate.startMs) / MIN;
  let startMs = candidate.startMs;
  let endMs = candidate.endMs;
  let count = 1;
  let prevEnd = candidate.endMs;
  for (let i = idx + 1; i < all.length; i++) {
    if ((all[i].startMs - prevEnd) / MIN > CHAIN_GAP_MIN) break;
    total += (all[i].endMs - all[i].startMs) / MIN;
    endMs = Math.max(endMs, all[i].endMs);
    prevEnd = Math.max(prevEnd, all[i].endMs);
    count++;
  }
  let nextStart = candidate.startMs;
  for (let i = idx - 1; i >= 0; i--) {
    if ((nextStart - all[i].endMs) / MIN > CHAIN_GAP_MIN) break;
    total += (all[i].endMs - all[i].startMs) / MIN;
    startMs = Math.min(startMs, all[i].startMs);
    nextStart = Math.min(nextStart, all[i].startMs);
    count++;
  }
  return { minutes: Math.round(total), startMs, endMs, count };
};

const _dateKeyOfMs = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// maior sequência de dias-calendário consecutivos que inclui `dateKey`,
// com as datas de início/fim da sequência (para a mensagem).
const _consecutiveDays = (dateKey, others) => {
  // Exclui carryover 'D' (rabo da noite anterior) — não é um novo dia trabalhado.
  const worked = new Set(others.filter(o => o.label !== 'D').map(o => o.dateKey));
  worked.add(dateKey);
  const dayMs = DAY_MIN * MIN;
  const base = new Date(`${dateKey}T00:00:00`).getTime();
  let back = 0, fwd = 0;
  for (let i = 1; worked.has(_dateKeyOfMs(base - i * dayMs)); i++) back++;
  for (let i = 1; worked.has(_dateKeyOfMs(base + i * dayMs)); i++) fwd++;
  const startMs = base - back * dayMs;
  const endMs = base + fwd * dayMs;
  return { run: back + fwd + 1, startBr: _ddmm(startMs), endBr: _ddmm(endMs) };
};

// ── ranking de vagas ──────────────────────────────────────────────────────────

/**
 * Avalia e ordena vagas: safe → risky → blocked, depois por data.
 * @returns {{opening:object, interval:object, evaluation:object}[]}
 */
export const rankOpenings = (openings, existingShifts, config) => {
  const existingIntervals = (existingShifts || []).map(shiftToInterval).filter(Boolean);
  return (openings || [])
    .map(opening => {
      const interval = openingToInterval(opening);
      const evaluation = interval
        ? evaluateCandidate(interval, existingIntervals, config)
        : { verdict: VERDICT.BLOCKED, violations: [{ rule: 'invalid', severity: 'block', message: 'Horário inválido' }] };
      return { opening, interval, evaluation };
    })
    .sort((a, b) => {
      const d = VERDICT_ORDER[a.evaluation.verdict] - VERDICT_ORDER[b.evaluation.verdict];
      if (d !== 0) return d;
      return (a.interval?.startMs || 0) - (b.interval?.startMs || 0);
    });
};

// ── classificação de dias (visual do calendário) ────────────────────────────────

export const DAY_STATUS = { FOLGA: 'folga', FULL: 'full', GOOD: 'good', WEEKEND: 'weekend', NEUTRAL: 'neutral' };

const _nextMidnightMs = (dateKey) => {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};
const _isLastDayOfMonth = (dateKey) => {
  const d = new Date(`${dateKey}T00:00:00`);
  const mo = d.getMonth();
  d.setDate(d.getDate() + 1);
  return d.getMonth() !== mo;
};

/**
 * Soma dos minutos agendados (para a meta). Com monthEndNightCutoff, o plantão N
 * do último dia do mês conta só até a meia-noite (ex.: 19h→07h vira 5h), porque
 * alguns hospitais só pagam as horas dentro do mês. Não afeta fadiga (lá vale o
 * plantão inteiro).
 */
export const scheduledMinutes = (shifts, config) => {
  const cutoff = !!config?.monthEndNightCutoff;
  return (shifts || []).map(shiftToInterval).filter(Boolean).reduce((sum, iv) => {
    let mins = iv.durationMinutes;
    if (cutoff && iv.label === 'N' && _isLastDayOfMonth(iv.dateKey)) {
      const midnight = _nextMidnightMs(iv.dateKey);
      if (iv.endMs > midnight) mins = Math.max(0, Math.round((midnight - iv.startMs) / MIN));
    }
    return sum + mins;
  }, 0);
};

/**
 * Classifica um dia para colorir o calendário, de forma determinística:
 *   - folga   : dia marcado como folga.
 *   - good    : há turno livre seguro p/ encaixar (verde) — gate em greenAllowed.
 *   - weekend : FDS livre que só é "arriscado" pela flag evitar-FDS, mas você
 *               precisa de horas (needHours) → azul claro: talvez seja a saída.
 *   - full    : nenhum turno livre seguro (saturado/bloqueado).
 *   - neutral : sem sinal relevante.
 * @param {string} dateKey
 * @param {object[]} existingIntervals  plantões do mês (intervalos)
 * @param {object} config
 * @param {{greenAllowed?:boolean, needHours?:boolean}} opts
 * @returns {{status:string, safeTurnos:string[]}}
 */
export const classifyDay = (dateKey, existingIntervals, config, opts = {}) => {
  const greenAllowed = !!opts.greenAllowed;
  const needHours = !!opts.needHours;
  if ((config?.folgas || []).some(f => f.startDate && f.endDate && dateKey >= f.startDate && dateKey <= f.endDate)) {
    return { status: DAY_STATUS.FOLGA, safeTurnos: [] };
  }
  const occupied = new Set((existingIntervals || []).filter(iv => iv.dateKey === dateKey).map(iv => iv.label));
  const freeTurnos = ['M', 'T', 'N'].filter(t => !occupied.has(t));

  let anyBlocked = false;
  const safe = [];
  const weekendOnly = []; // turnos que SÓ caem porque o usuário evita FDS
  for (const t of freeTurnos) {
    const ev = evaluateCandidate(candidateFromSlot(dateKey, t), existingIntervals, config);
    if (ev.verdict === VERDICT.SAFE) safe.push(t);
    else if (ev.verdict === VERDICT.BLOCKED) anyBlocked = true;
    else if (ev.violations.length && ev.violations.every(v => v.rule === 'weekend')) weekendOnly.push(t);
  }

  if (safe.length > 0) {
    return greenAllowed
      ? { status: DAY_STATUS.GOOD, safeTurnos: safe }
      : { status: DAY_STATUS.NEUTRAL, safeTurnos: safe };
  }
  // FDS livre + preciso de horas → azul (talvez a única saída seja pegar o FDS)
  if (weekendOnly.length > 0 && needHours) {
    return { status: DAY_STATUS.WEEKEND, safeTurnos: weekendOnly };
  }
  // sem turno livre seguro: saturado se já tem plantão, está bloqueado, ou sem espaço
  if (occupied.size > 0 || anyBlocked || freeTurnos.length === 0) {
    return { status: DAY_STATUS.FULL, safeTurnos: [] };
  }
  return { status: DAY_STATUS.NEUTRAL, safeTurnos: [] };
};

// ── panorama do mês ──────────────────────────────────────────────────────────

/**
 * Resumo da escala atual para o painel do Aura.
 * @returns {{shiftCount:number, maxConsecutiveDays:number, restAlerts:string[]}}
 */
export const analyzeSchedule = (existingShifts, config) => {
  const rules = { ...DEFAULT_RULES, ...(config?.rules || {}) };
  const intervals = (existingShifts || []).map(shiftToInterval).filter(Boolean).sort((a, b) => a.startMs - b.startMs);

  // maior sequência de dias consecutivos
  let maxRun = 0;
  const workedDays = new Set(intervals.filter(i => i.label !== 'D').map(i => i.dateKey));
  for (const key of workedDays) {
    const { run } = _consecutiveDays(key, intervals);
    if (run > maxRun) maxRun = run;
  }

  // alertas de descanso entre plantões adjacentes (nomeando os dois plantões)
  const restAlerts = [];
  for (let i = 1; i < intervals.length; i++) {
    const gap = (intervals[i].startMs - intervals[i - 1].endMs) / MIN;
    if (gap >= 0 && gap < rules.minRestMinutes) {
      restAlerts.push(`Só ${fmtH(gap)} entre o ${_describe(intervals[i - 1])} e o ${_describe(intervals[i])}`);
    }
  }

  return { shiftCount: intervals.length, maxConsecutiveDays: maxRun, restAlerts };
};

// ── seam para LLM futura (não usado ainda) ───────────────────────────────────────
// TODO(Aura/LLM): empacotar features computados pra uma camada de raciocínio
// opcional, SEM mudar o motor determinístico acima. Nenhuma chamada de rede.
export const buildAuraContext = (existingShifts, openings, config) => ({
  schedule: analyzeSchedule(existingShifts, config),
  ranked: rankOpenings(openings, existingShifts, config).map(r => ({
    dateKey: r.interval?.dateKey,
    label: r.interval?.label,
    verdict: r.evaluation.verdict,
    violations: r.evaluation.violations,
  })),
  rules: { ...DEFAULT_RULES, ...(config?.rules || {}) },
});

export { fmtH as formatMinutes };
