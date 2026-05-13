/**
 * Utilitários centralizados para manipulação de tempo
 * Fonte da verdade: minutos totais
 */

export class TimeUtils {
  /**
   * Converte minutos totais para display em formato legível
   * @param {number} totalMinutes - Minutos totais
   * @returns {string} Formato "Xh Ymin", "Xh" ou "Ymin"
   */
  static minutesToDisplay(totalMinutes) {
    if (!totalMinutes || totalMinutes === 0) return '0';
    
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    const sign = totalMinutes < 0 ? '-' : '';
    
    if (hours === 0) {
      return `${sign}${minutes}min`;
    } else if (minutes === 0) {
      return `${sign}${hours}h`;
    } else {
      return `${sign}${hours}h ${minutes}min`;
    }
  }

  /**
   * Converte minutos totais para horas decimais (só para cálculos financeiros legados)
   * @param {number} totalMinutes - Minutos totais
   * @returns {number} Horas em formato decimal
   */
  static minutesToDecimalHours(totalMinutes) {
    return totalMinutes / 60;
  }

  /**
   * Converte horas decimais para minutos totais (migração de dados legados)
   * @param {number} decimalHours - Horas em formato decimal
   * @returns {number} Minutos totais
   */
  static decimalHoursToMinutes(decimalHours) {
    return Math.round(decimalHours * 60);
  }

  /**
   * Calcula duração entre dois horários em minutos
   * @param {string} startTime - Horário inicial (formato "07:00" ou "07h00")
   * @param {string} endTime - Horário final (formato "19:00" ou "19h00")
   * @returns {number|null} Duração em minutos ou null se inválido
   */
  static calculateDurationMinutes(startTime, endTime) {
    try {
      // Normalizar formato dos horários (tanto "07h00" quanto "07:00")
      const normalizeTime = (time) => {
        return time.replace('h', ':');
      };
      
      const normalizedStart = normalizeTime(startTime);
      const normalizedEnd = normalizeTime(endTime);
      
      const [startHour, startMin] = normalizedStart.split(':').map(Number);
      const [endHour, endMin] = normalizedEnd.split(':').map(Number);
      
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        return null;
      }
      
      const startTotalMin = startHour * 60 + startMin;
      let endTotalMin = endHour * 60 + endMin;
      
      // Considerar cruzamento de meia-noite
      if (endTotalMin < startTotalMin) {
        endTotalMin += 24 * 60;
      }
      
      return endTotalMin - startTotalMin;
    } catch (error) {
      console.warn('Erro ao calcular duração:', error);
      return null;
    }
  }

  /**
   * Converte horas padrão de plantão para minutos
   * @param {string} shiftLabel - Label do plantão ('M', 'T', 'N')
   * @returns {number} Minutos padrão do plantão
   */
  static getShiftStandardMinutes(shiftLabel) {
    switch (shiftLabel?.charAt(0)) {
      case 'M': // Manhã
      case 'T': // Tarde
        return 6 * 60; // 360 minutos
      case 'N': // Noite
      case 'D': // Derivado/Carryover — always the tail of a night shift
        return 12 * 60; // 720 minutos
      default:
        return 0;
    }
  }

  /**
   * Formata minutos para exibição compacta (usado em listas)
   * @param {number} totalMinutes - Minutos totais
   * @returns {string} Formato compacto como "6h33" ou "33min"
   */
  static minutesToCompactDisplay(totalMinutes) {
    if (!totalMinutes || totalMinutes === 0) return '0';
    
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    const sign = totalMinutes < 0 ? '-' : '';
    
    if (hours === 0) {
      return `${sign}${minutes}min`;
    } else if (minutes === 0) {
      return `${sign}${hours}h`;
    } else {
      return `${sign}${hours}h${minutes.toString().padStart(2, '0')}`;
    }
  }
}

export default TimeUtils;