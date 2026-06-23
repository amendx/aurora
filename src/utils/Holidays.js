/**
 * Holidays — feriados brasileiros (nacionais fixos + móveis) para precificação.
 *
 * No escopo LUIS FRANÇA a folha paga feriado na faixa de FDS (ex.: terça de
 * Carnaval 17/02/2026 paga 170/h, igual sábado-dia). `isHoliday(dateKey)` é
 * usado por shouldUseWeekendValue só quando a config liga `treatHolidayAsWeekend`
 * — não muda o comportamento de quem não tem a flag.
 *
 * Datas no formato "YYYY-MM-DD". Móveis derivam da Páscoa (computus).
 */

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), retorna {month,day} 1-based.
const _easter = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
};

const _key = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Soma dias a uma data base (UTC meio-dia, mesmo critério de isWeekend).
const _shift = (year, month, day, deltaDays) => {
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return _key(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

const _cache = {};

// Conjunto de feriados nacionais de um ano (Set de "YYYY-MM-DD").
// Fixos + móveis (derivados da Páscoa). Usado p/ pagar feriado na faixa de FDS.
const _holidaysForYear = (year) => {
  if (_cache[year]) return _cache[year];
  const set = new Set();

  // Fixos nacionais
  set.add(_key(year, 1, 1));   // Confraternização Universal
  set.add(_key(year, 4, 21));  // Tiradentes
  set.add(_key(year, 5, 1));   // Dia do Trabalho
  set.add(_key(year, 9, 7));   // Independência
  set.add(_key(year, 10, 12)); // Nossa Senhora Aparecida
  set.add(_key(year, 11, 2));  // Finados
  set.add(_key(year, 11, 15)); // Proclamação da República
  set.add(_key(year, 11, 20)); // Consciência Negra
  set.add(_key(year, 12, 25)); // Natal

  // Móveis (relativos ao Domingo de Páscoa)
  const { month, day } = _easter(year);
  set.add(_shift(year, month, day, -48)); // Carnaval segunda
  set.add(_shift(year, month, day, -47)); // Carnaval terça
  set.add(_shift(year, month, day, -2));  // Sexta-feira Santa
  set.add(_shift(year, month, day, 60));  // Corpus Christi

  _cache[year] = set;
  return set;
};

/**
 * @param {string} dateKey "YYYY-MM-DD"
 * @returns {boolean}
 */
export const isHoliday = (dateKey) => {
  if (!dateKey || dateKey.length < 7) return false;
  const year = parseInt(dateKey.slice(0, 4), 10);
  if (!year) return false;
  return _holidaysForYear(year).has(dateKey);
};
