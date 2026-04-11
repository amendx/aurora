import Logger from './Logger';

/**
 * Utilitário para calcular horas de plantões
 */
export class ShiftCalculator {
  
  /**
   * Retorna as horas padrão por tipo de plantão
   */
  static getStandardHours(label) {
    switch (label) {
      case 'M': // Manhã
        return 6;
      case 'T': // Tarde
        return 6;
      case 'N': // Noite
        return 12;
      default:
        Logger.warn(`⚠️ Tipo de plantão desconhecido: ${label}`);
        return 0;
    }
  }

  /**
   * Calcula horas reais entre duas datas considerando cruzamento de mês
   */
  static calculateRealHours(startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        Logger.error('❌ Datas inválidas para cálculo:', { startDate, endDate });
        return 0;
      }

      // Calcular diferença em milissegundos e converter para horas
      const diffMs = end.getTime() - start.getTime();
      const hours = diffMs / (1000 * 60 * 60);
      
      Logger.info(`⏰ Horas calculadas: ${hours}h (${startDate} → ${endDate})`);
      return Math.round(hours * 100) / 100; // Arredondar para 2 casas decimais
      
    } catch (error) {
      Logger.error('❌ Erro ao calcular horas:', error.message);
      return 0;
    }
  }

  /**
   * Calcula total de horas de um array de plantões
   */
  static calculateTotalHours(shifts, useRealHours = false) {
    if (!Array.isArray(shifts)) {
      Logger.warn('⚠️ Array de plantões inválido');
      return 0;
    }

    let totalHours = 0;
    let monthlyBreakdown = {};

    shifts.forEach(shift => {
      let hours = 0;
      
      if (useRealHours && shift.start_date && shift.end_date) {
        // Usar horas reais calculadas
        hours = this.calculateRealHours(shift.start_date, shift.end_date);
      } else {
        // Usar horas padrão por tipo
        hours = this.getStandardHours(shift.label);
      }

      totalHours += hours;

      // Agrupar por mês para análise
      const month = shift.start_date ? shift.start_date.substring(0, 7) : 'unknown';
      if (!monthlyBreakdown[month]) {
        monthlyBreakdown[month] = { hours: 0, count: 0 };
      }
      monthlyBreakdown[month].hours += hours;
      monthlyBreakdown[month].count += 1;
    });

    Logger.info(`📊 Total de horas calculado: ${totalHours}h`);
    Logger.info(`📅 Breakdown mensal:`, monthlyBreakdown);

    return totalHours;
  }

  /**
   * Analisa plantões que cruzam o mês
   */
  static analyzeCrossMonthShifts(shifts, targetMonth, targetYear) {
    const crossMonthShifts = [];
    const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    
    shifts.forEach(shift => {
      if (!shift.start_date || !shift.end_date) return;
      
      const startMonth = shift.start_date.substring(0, 7);
      const endMonth = shift.end_date.substring(0, 7);
      
      if (startMonth !== endMonth) {
        const realHours = this.calculateRealHours(shift.start_date, shift.end_date);
        const standardHours = this.getStandardHours(shift.label);
        
        // Calcular quantas horas pertencem ao mês atual
        const startDate = new Date(shift.start_date);
        const endDate = new Date(shift.end_date);
        
        let hoursInTargetMonth = 0;
        
        if (startMonth === monthKey) {
          // Plantão começa no mês alvo
          const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);
          const effectiveEnd = endDate > endOfMonth ? endOfMonth : endDate;
          hoursInTargetMonth = this.calculateRealHours(shift.start_date, effectiveEnd.toISOString());
        } else if (endMonth === monthKey) {
          // Plantão termina no mês alvo
          const startOfMonth = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0);
          const effectiveStart = startDate < startOfMonth ? startOfMonth : startDate;
          hoursInTargetMonth = this.calculateRealHours(effectiveStart.toISOString(), shift.end_date);
        }
        
        crossMonthShifts.push({
          ...shift,
          realHours,
          standardHours,
          hoursInTargetMonth,
          crossesMonth: true
        });
      }
    });
    
    if (crossMonthShifts.length > 0) {
      Logger.info(`🔀 Encontrados ${crossMonthShifts.length} plantões que cruzam o mês`);
      crossMonthShifts.forEach(shift => {
        Logger.info(`  • ${shift.time}: ${shift.hoursInTargetMonth}h no mês atual`);
      });
    }
    
    return crossMonthShifts;
  }

  /**
   * Gera relatório detalhado de horas
   */
  static generateHoursReport(shifts, month, year) {
    const report = {
      month: `${month}/${year}`,
      totalShifts: shifts.length,
      standardHours: this.calculateTotalHours(shifts, false),
      realHours: this.calculateTotalHours(shifts, true),
      crossMonthShifts: this.analyzeCrossMonthShifts(shifts, month, year),
      breakdown: {
        M: { count: 0, hours: 0 },
        T: { count: 0, hours: 0 },
        N: { count: 0, hours: 0 }
      }
    };

    // Contar por tipo
    shifts.forEach(shift => {
      const label = shift.label;
      if (report.breakdown[label]) {
        report.breakdown[label].count += 1;
        report.breakdown[label].hours += this.getStandardHours(label);
      }
    });

    Logger.info(`📋 Relatório de horas gerado para ${month}/${year}:`, report);
    return report;
  }
}

export default ShiftCalculator;