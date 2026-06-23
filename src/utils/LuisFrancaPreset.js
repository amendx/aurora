/**
 * LuisFrancaPreset — config financeira fixa do hospital LUIS FRANÇA, aplicada
 * AUTOMATICAMENTE só no escopo webClient (login só-visualização / Soffia).
 *
 * Engenharia reversa da folha médica (Vl Pagar das notas a emitir):
 *   - Taxas/hora: dia-sem 130, noite-sem 143, dia-FDS 170, noite-FDS 185.
 *   - Plantão valorizado INTEIRO pela taxa do dia/turno de INÍCIO (M/T=dia,
 *     N=noite); não há split por meia-noite. Sexta-NOITE conta como FDS (185):
 *     `fridayNightAsWeekend:true`. Provado na nota RAQUEL fev/26 (R$30.956,65):
 *     o balde FDS "Sab Dia/Dom Noit" = 31:57 só fecha com a N de sexta 27/02
 *     (735min); sem ela a nota fica ~R$616 curta. Os 21 plantões do ponto
 *     reconciliam (10.241min = 170:41) e dão ~R$30.983 (0,08%, arredondamento).
 *   - Feriado paga FDS (170 dia / 185 noite): Carnaval terça 17/02, 7h = 1.190.
 *   - Frações: minuto conta como fração real (min/60), nunca hora cheia.
 *     Arredonda por turno (centavos) e soma.
 *   - Fidelização: faixas por TOTAL de horas no hospital (soma de todos os
 *     grupos/escalas), faixas default do Aurora. Ex.: 124,72h → 20%.
 *
 * NÃO toca o escopo aurora-native: `applyLuisFrancaPreset` é no-op quando
 * `viewOnly` é falso. Reusa a máquina per-hospital existente
 * (institutionConfig / institutionLoyalty / currentInstitutionLoyalty +
 * HospitalConfigResolver), só injeta os valores.
 */
import TimeUtils from './TimeUtils';

// Faixas default do Aurora — batem com a folha (124,72h → 20%).
const TIERS = [
  { minHours: 72,  percentage: 10 },
  { minHours: 120, percentage: 20 },
  { minHours: 168, percentage: 25 },
  { minHours: 264, percentage: 30 },
];

const INSTITUTION_CONFIG = {
  hourValues: {
    weekday: { day: 130, night: 143 },
    weekend: { day: 170, night: 185 },
  },
  bonusEnabled: false,
  fridayNightAsWeekend: true, // sexta-noite (N) paga FDS 185: nota fev/26 só fecha assim
  treatHolidayAsWeekend: true, // feriado paga na faixa de FDS (170 dia / 185 noite)
};

const LOYALTY = {
  autoFromHours: true,
  loyaltyOptions: TIERS,
  manualPercentage: 0,
};

// Identifica a institution LUIS FRANÇA pelo nome (varia no PlantaoAPI:
// "HOSPITAL LUIS FRANCA", "HILF - …", etc.).
export const isLuisFranca = (name) =>
  /lu[ií]s\s+(?:de\s+)?fran[cç]a|\bhilf\b/i.test(String(name || ''));

// Horas por institution no mês. A faixa de fidelização é por horas REAIS
// (folha confirma: fev/26 162h escala + 8h45 extras = 170,68h → faixa 168 = 25%,
// não 20% das planejadas). Usa actualDurationMinutes do timeEntry quando há
// registro; senão cai nas horas previstas do shift.
const _hoursByInstitution = (daysWithShifts, timeEntries = {}) => {
  const map = {};
  (daysWithShifts || []).forEach((day) => {
    (day.shifts || []).forEach((shift) => {
      const iid = String(shift.group?.institution?.id || '');
      if (!iid) return;
      const entry = timeEntries[shift.id];
      const actualMin = entry
        ? TimeUtils.actualMinutesThisMonth(shift, entry.actualStart, entry.actualEnd, entry.actualDurationMinutes)
        : null;
      let h = 0;
      if (actualMin > 0) {
        h = actualMin / 60;
      } else if (shift.splitHours) {
        h = shift.splitHours.hoursThisMonth;
      } else {
        const timeStr = shift.time || '';
        let parts = timeStr.split(' – ');
        if (parts.length !== 2) parts = timeStr.split(' - ');
        if (parts.length === 2) {
          const norm = (t) => t.replace(/\s*\([^)]*\)/, '').replace('h', ':').trim();
          const m = TimeUtils.calculateDurationMinutes(norm(parts[0]), norm(parts[1]));
          if (m != null && m > 0) h = m / 60;
        }
        if (!h) h = (shift.label?.charAt(0) === 'N' || shift.carryover) ? 12 : 6;
      }
      map[iid] = (map[iid] || 0) + h;
    });
  });
  return map;
};

const _tierFor = (hours) =>
  TIERS.filter((o) => o.minHours <= hours).sort((a, b) => b.minHours - a.minHours)[0] || null;

// instId → nome a partir dos shifts do mês.
const _instNames = (daysWithShifts) => {
  const m = {};
  (daysWithShifts || []).forEach((day) =>
    (day.shifts || []).forEach((s) => {
      const inst = s.group?.institution;
      if (inst?.id) m[String(inst.id)] = inst.name || '';
    })
  );
  return m;
};

/**
 * Overlay automático do preset LUIS FRANÇA sobre a FinancialConfig.
 * No-op fora do escopo view-only ou quando nenhum hospital LUIS FRANÇA aparece
 * no mês. Sobrescreve qualquer config existente desse hospital (fonte fixa).
 *
 * @param {object} config           FinancialConfig
 * @param {Array}  daysWithShifts
 * @param {boolean} viewOnly        true só p/ login webClient/Soffia
 * @param {object} timeEntries      { [shiftId]: TimeEntry } — horas reais p/ faixa de fidelização
 * @returns {object} config efetiva (novo objeto; original intacto)
 */
export const applyLuisFrancaPreset = (config, daysWithShifts, viewOnly, timeEntries = {}) => {
  const base = config || {};
  if (!viewOnly) return base;

  const names = _instNames(daysWithShifts);
  const matches = Object.keys(names).filter((id) => isLuisFranca(names[id]));
  if (matches.length === 0) return base;

  const hoursByInst = _hoursByInstitution(daysWithShifts, timeEntries);
  const institutionConfig = { ...(base.institutionConfig || {}) };
  const institutionLoyalty = { ...(base.institutionLoyalty || {}) };
  const currentInstitutionLoyalty = { ...(base.currentInstitutionLoyalty || {}) };
  const combinedHours = matches.reduce((sum, id) => sum + (hoursByInst[id] || 0), 0);
  const combinedTier = _tierFor(combinedHours);

  matches.forEach((id) => {
    institutionConfig[id] = { ...INSTITUTION_CONFIG };
    institutionLoyalty[id] = { ...LOYALTY };
    currentInstitutionLoyalty[id] = {
      percentage: combinedTier?.percentage || 0,
      minHours: combinedTier?.minHours || 0,
      hoursWorked: combinedHours,
      earnedAt: new Date().toISOString(),
    };
  });

  return { ...base, institutionConfig, institutionLoyalty, currentInstitutionLoyalty };
};
