/**
 * formatDate — formatação pt-BR de datas curtas, sem deslocamento de fuso.
 * Aceita "YYYY-MM-DD" (ou ISO completo, do qual usa só a parte de data).
 * Usado nos corpos de notificação pra nunca exibir o cru "2026-06-16".
 */
const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "2026-06-16" → "seg, 16 jun". Devolve a string original se não casar. */
export function fmtDateBR(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return String(dateStr || '');
  const y = +m[1], mo = +m[2], d = +m[3];
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${WEEKDAYS_ABBR[wd]}, ${d} ${MONTHS_ABBR[mo - 1]}`;
}
