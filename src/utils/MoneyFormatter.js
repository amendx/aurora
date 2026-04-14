/**
 * Utilitário para formatação de valores monetários
 */

/**
 * Formata valor em real brasileiro
 * @param {number} value - Valor numérico
 * @returns {string} - Valor formatado (ex: "R$ 1.234,56")
 */
export const formatMoney = (value) => {
  if (!value || isNaN(value)) return 'R$ 0,00';
  
  // Converter para número se for string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Formatação brasileira com separador de milhares
  return numValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Formata valor compacto (sem "R$", só o número)
 * @param {number} value - Valor numérico  
 * @returns {string} - Valor formatado (ex: "1.234,56")
 */
export const formatMoneyCompact = (value) => {
  if (!value || isNaN(value)) return '0,00';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  return numValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Formata valor por hora (ex: "R$ 143/h")
 * @param {number} value - Valor numérico
 * @returns {string} - Valor formatado por hora
 */
export const formatHourlyRate = (value) => {
  if (!value || isNaN(value)) return 'R$ 0/h';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  return `R$ ${Math.round(numValue)}/h`;
};

export default { formatMoney, formatMoneyCompact, formatHourlyRate };