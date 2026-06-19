/**
 * Aura (IA do Aurora) — AvailabilityConfig.
 *
 * Disponibilidade do médico para o conselho de escala:
 *   - recurringBlocks : compromissos fixos semanais (esporte, terapia…) que
 *                       impedem pegar plantão num turno/horário daquele dia.
 *   - folgas          : intervalos de datas (1+ dias) sem plantão (viagem…).
 *   - rules           : parâmetros de fadiga usados pelo motor (AuraEngine).
 *
 * Persistência: LocalCache.getAvailability / saveAvailability
 *   (AsyncStorage `aurora_availability_{uid}` + sombra Firebase).
 *
 * Default (sem config salva): nenhum bloqueio/folga, regras padrão.
 */

import LocalCache from '../services/LocalCache';

// Defaults das regras de fadiga (minutos inteiros — regra dura do projeto).
export const DEFAULT_RULES = {
  minRestMinutes: 0,              // descanso entre plantões: 0 = só avisa se o usuário ativar
  maxConsecutiveMinutes: 18 * 60, // 18h empilhadas (M+T ok; M+T+N=24h vira arriscado)
  maxConsecutiveDays: 5,          // dias seguidos trabalhados
  eventBufferMinutes: 75,         // deslocamento mínimo entre plantão e compromisso/evento
};

// Paleta para o usuário marcar cor de cada compromisso (visual no calendário).
export const COMPROMISSO_COLORS = [
  '#5A8DD1', '#9B6BD1', '#E0524C', '#E08A00',
  '#2F9266', '#D14F8F', '#3FA9A7', '#7A7F87',
];

const _emptyConfig = () => ({
  recurringBlocks: [],
  folgas: [],
  events: [],          // eventos pontuais: data específica + turno/horário (festa…).
  rules: { ...DEFAULT_RULES },
  targetHours: 0,      // meta de horas/mês (fidelização). 0 = sem meta.
  avoidWeekend: false, // evitar FDS: sexta à noite, sábado e domingo.
  monthEndNightCutoff: false, // N do último dia do mês conta só até a meia-noite.
});

const _genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Carrega a config aplicando defaults sobre o que estiver salvo.
 * @param {string|number} userId
 * @returns {Promise<{recurringBlocks: Array, folgas: Array, rules: object}>}
 */
export const loadAvailability = async (userId) => {
  const saved = await LocalCache.getAvailability(userId);
  if (!saved) return _emptyConfig();
  return {
    recurringBlocks: Array.isArray(saved.recurringBlocks) ? saved.recurringBlocks : [],
    folgas: Array.isArray(saved.folgas) ? saved.folgas : [],
    events: Array.isArray(saved.events) ? saved.events : [],
    rules: { ...DEFAULT_RULES, ...(saved.rules || {}) },
    targetHours: typeof saved.targetHours === 'number' ? saved.targetHours : 0,
    avoidWeekend: !!saved.avoidWeekend,
    monthEndNightCutoff: !!saved.monthEndNightCutoff,
  };
};

/**
 * Persiste a config (local + sombra Firebase via LocalCache).
 * @param {string|number} userId
 * @param {object} config
 */
export const saveAvailability = (userId, config) =>
  LocalCache.saveAvailability(userId, {
    ...config,
    updatedAt: new Date().toISOString(),
  });

// ── Mutações imutáveis (retornam nova config; caller salva) ────────────────────

/**
 * Adiciona um bloqueio recorrente.
 * @param {object} config
 * @param {{weekday:number, mode:'turno'|'time', turnos?:string[], startTime?:string, endTime?:string, label?:string}} block
 */
export const addBlock = (config, block) => ({
  ...config,
  recurringBlocks: [...(config.recurringBlocks || []), { id: _genId(), ...block }],
});

export const removeBlock = (config, blockId) => ({
  ...config,
  recurringBlocks: (config.recurringBlocks || []).filter(b => b.id !== blockId),
});

/**
 * Adiciona uma folga (intervalo de datas inclusivo).
 * @param {object} config
 * @param {{startDate:string, endDate:string, label?:string}} folga  datas "YYYY-MM-DD"
 */
export const addFolga = (config, folga) => ({
  ...config,
  folgas: [...(config.folgas || []), { id: _genId(), ...folga }],
});

export const removeFolga = (config, folgaId) => ({
  ...config,
  folgas: (config.folgas || []).filter(f => f.id !== folgaId),
});

/**
 * Evento pontual: bloqueia um turno/horário numa data específica (festa…).
 * @param {{date:string, mode:'turno'|'time', turnos?:string[], startTime?:string, endTime?:string, label?:string, color?:string}} event
 */
export const addEvent = (config, event) => ({
  ...config,
  events: [...(config.events || []), { id: _genId(), ...event }],
});

export const removeEvent = (config, eventId) => ({
  ...config,
  events: (config.events || []).filter(e => e.id !== eventId),
});

export const setRules = (config, rules) => ({
  ...config,
  rules: { ...DEFAULT_RULES, ...(config.rules || {}), ...rules },
});

export const setTarget = (config, targetHours) => ({
  ...config,
  targetHours: Math.max(0, targetHours),
});

export const setAvoidWeekend = (config, value) => ({
  ...config,
  avoidWeekend: !!value,
});

export const setMonthEndCutoff = (config, value) => ({
  ...config,
  monthEndNightCutoff: !!value,
});
