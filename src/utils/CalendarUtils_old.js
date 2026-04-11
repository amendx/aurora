import Logger from './Logger';

export class CalendarUtils {
  /**
   * Extrai os dias com plantões de um mês
   * @param {Object} calendarData - Dados retornados pela API 
   * @param {number} year - Ano
   * @param {number} month - Mês (1-12)
   * @returns {Array} Array com os dias que têm plantões
   */
  static extractDaysWithShifts(calendarData, year, month) {
    Logger.info(`🔍 Processando dados do calendário para ${month}/${year}`);
    
    // A API retorna um objeto com 'current', 'previous', etc.
    // Vamos usar os dados do mês atual
    if (!calendarData || typeof calendarData !== 'object') {
      Logger.warn('⚠️ Dados do calendário não são um objeto válido');
      return [];
    }

    let monthlyData = [];
    
    // Buscar pelo mês atual primeiro
    if (calendarData.current && calendarData.current.days) {
      monthlyData = calendarData.current.days;
      Logger.debug(`📅 Usando dados do mês atual: ${calendarData.current.month}`);
    } else if (calendarData.days) {
      // Fallback caso os dados estejam diretamente em 'days'
      monthlyData = calendarData.days;
      Logger.debug(`📅 Usando dados diretos do array 'days'`);
    } else {
      Logger.warn('⚠️ Estrutura de dados do calendário não reconhecida');
      return [];
    }

    if (!Array.isArray(monthlyData)) {
      Logger.warn('⚠️ Dados dos dias não são um array');
      return [];
    }

    const daysWithShifts = [];
    
    monthlyData.forEach((item, index) => {
      try {
        // A nova API retorna: {"date": "2026-03-15", "shifts": ["id1", "id2"], ...}
        let date = null;
        
        if (item.date) {
          date = item.date;
        } else if (item.day && item.month && item.year) {
          date = `${item.year}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
        } else if (item.start_date) {
          date = item.start_date;
        }

        // Só processa se há shifts disponíveis
        const hasShifts = item.shifts && Array.isArray(item.shifts) && item.shifts.length > 0;
        
        if (date && hasShifts) {
          const dateObj = new Date(date);
          const day = dateObj.getDate();
          const itemMonth = dateObj.getMonth() + 1;
          const itemYear = dateObj.getFullYear();
          
          // Verifica se é do mês/ano atual
          if (itemMonth === month && itemYear === year) {
            daysWithShifts.push({
              day,
              date: dateObj,
              shifts: item.shifts,
              shiftsCount: item.shifts.length,
              originalData: item
            });
            
            Logger.debug(`📅 Dia ${day} tem ${item.shifts.length} plantão(ões)`);
          }
        }
      } catch (error) {
        Logger.error(`❌ Erro processando item ${index}:`, error.message);
      }
    });

    Logger.info(`✅ Encontrados ${daysWithShifts.length} dias com plantões em ${month}/${year}`);
    Logger.debug('📋 Dias com plantões:', daysWithShifts.map(d => d.day));
    
    return daysWithShifts;
  }

  /**
   * Gera os dias do mês para o calendário
   * @param {number} year - Ano
   * @param {number} month - Mês (1-12)
   * @returns {Array} Array com informações dos dias do mês
   */
  static generateCalendarDays(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = domingo

    const days = [];

    // Adicionar dias vazios para completar a primeira semana
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ day: null, isEmpty: true });
    }

    // Adicionar os dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        date: new Date(year, month - 1, day),
        isEmpty: false,
        hasShift: false // Será atualizado com os dados da API
      });
    }

    return days;
  }

  /**
   * Marca os dias que têm plantões no calendário
   * @param {Array} calendarDays - Dias gerados pelo generateCalendarDays
   * @param {Array} daysWithShifts - Dias com plantões da API
   * @returns {Array} Array atualizado com informação de plantões
   */
  static markShiftDays(calendarDays, daysWithShifts) {
    const shiftDaysSet = new Set(daysWithShifts.map(d => d.day));
    
    return calendarDays.map(calendarDay => {
      if (calendarDay.isEmpty) {
        return calendarDay;
      }
      
      return {
        ...calendarDay,
        hasShift: shiftDaysSet.has(calendarDay.day),
        shiftData: daysWithShifts.find(d => d.day === calendarDay.day)?.originalData
      };
    });
  }

  /**
   * Formatar nome do mês
   * @param {number} month - Mês (1-12)
   * @returns {string} Nome do mês em português
   */
  static getMonthName(month) {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[month - 1] || 'Mês Inválido';
  }

  /**
   * Navegar entre meses
   * @param {number} currentYear - Ano atual
   * @param {number} currentMonth - Mês atual (1-12)
   * @param {number} direction - Direção: -1 (anterior), 1 (próximo)
   * @returns {Object} Novo ano e mês
   */
  static navigateMonth(currentYear, currentMonth, direction) {
    let newMonth = currentMonth + direction;
    let newYear = currentYear;

    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }

    return { year: newYear, month: newMonth };
  }
}