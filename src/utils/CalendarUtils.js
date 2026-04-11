import Logger from './Logger';

export class CalendarUtils {
  static extractDaysWithShifts(calendarData, month, year) {
    Logger.info(`🔍 Processando dados do calendário para ${month}/${year}`);
    
    if (!calendarData || typeof calendarData !== 'object') {
      Logger.warn('⚠️ Dados do calendário não são um objeto válido');
      return [];
    }

    let apiData = null;
    if (calendarData.data) {
      const response = calendarData.data;
      
      if (response.data) {
        apiData = response.data;
      } else {
        apiData = response;
      }
    } else {
      apiData = calendarData;
    }
    
    const targetMonth = `${year}-${String(month).padStart(2, '0')}`;
    Logger.debug(`🎯 Buscando dados para: ${targetMonth}`);
    
    // Verificar seção current primeiro
    if (apiData && apiData.current) {
      Logger.debug(`📅 Seção 'current' encontrada!`);
      Logger.debug(`📅 Mês da seção current:`, apiData.current.month);
      
      if (apiData.current.month === targetMonth && apiData.current.days) {
        const days = apiData.current.days;
        const daysWithShifts = [];
        
        days.forEach((dayData, index) => {
          try {
            if (dayData.shifts && Array.isArray(dayData.shifts) && dayData.shifts.length > 0) {
              const dateString = dayData.date;
              const dateParts = dateString.split('-');
              const day = parseInt(dateParts[2], 10);
              const itemMonth = parseInt(dateParts[1], 10);
              const itemYear = parseInt(dateParts[0], 10);
              
              Logger.debug(`📅 Item ${index}: data=${dateString} -> Dia ${day}, Mês ${itemMonth}, Ano ${itemYear}`);
              
              if (itemMonth === month && itemYear === year) {
                const dayObject = {
                  day,
                  date: dateString,
                  shifts: dayData.shifts,
                  shiftsCount: dayData.shifts.length,
                  originalData: dayData
                };
                
                daysWithShifts.push(dayObject);
                
                Logger.debug(`✅ Item ${index} ACEITO: Dia ${day} com ${dayData.shifts.length} plantão(ões)`);
              }
            }
          } catch (error) {
            console.error(`❌ CalendarUtils DEBUG - Erro processando item ${index}:`, error);
            Logger.error(`❌ Erro processando item ${index}:`, error.message);
          }
        });
        
        Logger.info(`✅ PROCESSADOS ${daysWithShifts.length} dias com plantões para ${targetMonth}`);
        return daysWithShifts;
      }
    }
    
    Logger.warn(`⚠️ Não foi possível encontrar dados para ${targetMonth}`);
    return [];
  }

  static generateCalendarDays(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();

    const days = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day: day,
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isToday: false
      });
    }

    return days;
  }

  static markShiftDays(calendarDays, daysWithShifts) {
    if (!Array.isArray(calendarDays) || !Array.isArray(daysWithShifts)) {
      return calendarDays;
    }

    const shiftDayNumbers = new Set(daysWithShifts.map(d => d.day));

    return calendarDays.map(day => {
      if (day && shiftDayNumbers.has(day.day)) {
        return { ...day, hasShifts: true };
      }
      return day;
    });
  }

  static getMonthName(month) {
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return monthNames[month - 1];
  }

  static navigateMonth(currentYear, currentMonth, direction) {
    let newYear = currentYear;
    let newMonth = currentMonth;

    if (direction === 'next') {
      newMonth++;
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      }
    } else if (direction === 'prev') {
      newMonth--;
      if (newMonth < 1) {
        newMonth = 12;
        newYear--;
      }
    }

    return { year: newYear, month: newMonth };
  }
}

export default CalendarUtils;
