import Logger from '../utils/Logger';

const API_BASE_URL  = process.env.EXPO_PUBLIC_API_URL;
const API_ORIGIN    = process.env.EXPO_PUBLIC_API_ORIGIN ?? '';
const API_REFERER   = process.env.EXPO_PUBLIC_API_REFERER ?? '';
const API_USER_AGENT = process.env.EXPO_PUBLIC_API_USER_AGENT ?? 'Aurora-Mobile-App/1.0.0';

export class WebClientApiService {
  static async login(email, password) {
    const loginUrl = `${API_BASE_URL}/auth/login`;
    
    Logger.loginAttempt('[redacted]', loginUrl);
    Logger.userInput('senha', password, true); // password masked by Logger

    try {
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
        body: JSON.stringify({
          login: email,
          password: password,
        }),
      });


      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        const errorMsg = errorData.message || `Erro HTTP ${response.status}`;
        Logger.loginError('[redacted]', errorMsg, loginUrl);
        throw new Error(errorMsg);
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('Erro ao fazer parse da resposta JSON:', parseError.message);
        data = { rawResponse: responseText };
      }

      Logger.loginSuccess('[redacted]', { status: 'ok' });

      return {
        success: true,
        data,
      };
    } catch (error) {
      Logger.loginError('[redacted]', error.message, loginUrl);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  static async logout(token) {
    const logoutUrl = `${API_BASE_URL}/auth/logout`;
    
    Logger.logoutAttempt(logoutUrl);
    
    try {
      Logger.info(`🌐 Fazendo requisição de logout para: ${logoutUrl}`);
      
      const response = await fetch(logoutUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
      });


      if (response.ok) {
        Logger.logoutSuccess();
      } else {
        Logger.logoutError(`Status ${response.status}`, logoutUrl);
      }

      return {
        success: response.ok,
      };
    } catch (error) {
      Logger.logoutError(error.message, logoutUrl);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  static async getMonthlyCalendar(token, month = null, year = null) {
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth = month || (currentDate.getMonth() + 1); // getMonth() returns 0-11, API expects 1-12
    
    const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const calendarUrl = `${API_BASE_URL}/users/calendar/monthly/${monthKey}`;
    
    
    try {
      const response = await fetch(calendarUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
      });


      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        const errorMsg = errorData.message || `Erro HTTP ${response.status}`;
        Logger.error('❌ Erro ao buscar calendário:', errorMsg);
        throw new Error(errorMsg);
      }

      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse do calendário:', parseError.message);
        throw new Error('Erro ao processar resposta do calendário');
      }
      
      
      return {
        success: true,
        data,
        year: targetYear,
        month: targetMonth,
      };
    } catch (error) {
      Logger.error('❌ Erro na requisição do calendário:', error.message);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  /**
   * Busca dados do calendário mensal usando endpoint genérico (retorna current + previous + next)
   * @param {string} token - Token de autenticação
   * @returns {Promise<Object>} Dados do calendário com 3 meses
   */
  static async getGenericMonthlyCalendar(token) {
    const calendarUrl = `${API_BASE_URL}/users/calendar/monthly`;
    
    
    try {
      const response = await fetch(calendarUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
      });


      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        const errorMsg = errorData.message || `Erro HTTP ${response.status}`;
        Logger.error('❌ Erro ao buscar calendário genérico:', errorMsg);
        throw new Error(errorMsg);
      }

      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse da resposta JSON:', parseError.message);
        throw new Error('Resposta inválida do servidor');
      }
      
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      Logger.error('❌ Erro na requisição do calendário genérico:', error.message);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  /**
   * Busca plantões de um mês inteiro usando o monthly como fonte da verdade
   * e fazendo chamadas daily apenas nos dias com plantões
   * @param {string} token - Token de autenticação
   * @param {number} month - Mês (1-12)
   * @param {number} year - Ano
   * @returns {Promise<Object>} Dados consolidados dos plantões do mês
   */
  static async getMonthlyShiftsOptimized(token, month, year) {
    try {
      // 1. Buscar dados do monthly primeiro
      const monthlyResponse = await this.getMonthlyCalendar(token, month, year);
      
      if (!monthlyResponse.success || !monthlyResponse.data?.data?.current?.days) {
        throw new Error('Falha ao carregar calendário mensal');
      }
      
      const monthlyDays = monthlyResponse.data.data.current.days;
      
      // 2. Filtrar apenas dias que têm plantões
      const daysWithShifts = monthlyDays.filter(day => 
        day.shifts && day.shifts.length > 0
      );
      
      
      // 3. Buscar detalhes apenas dos dias com plantões
      const allShifts = [];
      const monthlyData = {
        totalShifts: 0,
        daysWithShifts: daysWithShifts.length,
        shifts: []
      };
      
      for (const dayInfo of daysWithShifts) {
        const dateObj = new Date(dayInfo.date + 'T00:00:00.000Z');
        const dailyResponse = await this.getDailyShifts(token, dateObj);
        
        if (dailyResponse.success && dailyResponse.data) {
          const dayShifts = dailyResponse.data;
          allShifts.push(...dayShifts);
          monthlyData.shifts.push({
            date: dayInfo.date,
            shiftsCount: dayShifts.length,
            shifts: dayShifts
          });
          monthlyData.totalShifts += dayShifts.length;
          
        }
      }
      
      
      return {
        success: true,
        data: allShifts,
        monthlyData,
        totalShifts: monthlyData.totalShifts
      };
      
    } catch (error) {
      Logger.error('❌ Erro ao buscar plantões otimizados:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Busca plantões específicos de um dia
   * @param {string} token - Token de autenticação
   * @param {Date} date - Data específica
   * @returns {Promise<Object>} Dados dos plantões do dia
   */
  static async getDailyShifts(token, date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dailyUrl = `${API_BASE_URL}/users/calendar/daily/${dateStr}`;
    
    
    try {
      const response = await fetch(dailyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Origin': API_ORIGIN,
          'Authorization': `Bearer ${token}`,
        },
      });


      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse dos plantões diários:', parseError.message);
        throw new Error('Erro ao processar resposta dos plantões diários');
      }
      
      // A API retorna os dados em data.data.items
      const shifts = data.data?.items || [];
      
      return {
        success: true,
        data: shifts,
        date: dateStr,
      };
    } catch (error) {
      Logger.error('❌ Erro na requisição dos plantões diários:', error.message);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  // Carregar grupos do usuário
  /**
   * Busca grupos do usuário ou todos os grupos
   * @param {string} token - Token de autenticação
   * @param {boolean} all - Se true, busca todos os grupos (não só os do usuário)
   */
  static async getGroups(token, all = false) {

    // API real — busca grupos (meus ou todos)
    const groupsUrl = all
      ? `${API_BASE_URL}/groups?page=1&limit=100&all=true`
      : `${API_BASE_URL}/groups?page=1&limit=100`;

    try {
      
      const response = await fetch(groupsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // Logger.debug('📦 Resposta grupos:', JSON.stringify(data, null, 2));
      
      if (!data) {
        Logger.error('❌ Resposta vazia da API de grupos');
        throw new Error('Erro ao processar resposta dos grupos');
      }
      
      Logger.info(`✅ Grupos carregados - ${data.data?.items?.length || 0} grupos`);
      
      return data;
    } catch (error) {
      Logger.error('❌ Erro na requisição dos grupos:', error.message);
      throw error;
    }
  }
  // Buscar detalhes de um grupo específico pelo ID
  static async getGroupById(token, groupId) {
    const url = `${API_BASE_URL}/groups/${groupId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Origin': API_ORIGIN,
          'Referer': API_REFERER,
          'User-Agent': API_USER_AGENT,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      Logger.error(`❌ Erro ao buscar grupo ${groupId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca TODOS os membros de um grupo com paginação automática
   * Usa /groups/{id}/members
   * @param {string} token - Token de autenticação
   * @param {string} groupId - ID do grupo
   * @returns {Promise<Object>} Lista completa de membros
   */
  static async getGroupMembers(token, groupId) {
    const allMembers = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    try {
      while (hasMore) {
        const url = `${API_BASE_URL}/groups/${groupId}/members?page=${page}&limit=${limit}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Version': '2.0',
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache',
            'Origin': API_ORIGIN,
            'Referer': API_REFERER,
            'User-Agent': API_USER_AGENT,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Log da estrutura na primeira página para diagnóstico
        if (page === 1) {
          Logger.debug(`📦 Estrutura resposta /members: ${JSON.stringify(Object.keys(data.data || data || {}))}`);
        }

        const items = data.data?.items || data.data || [];
        
        if (Array.isArray(items) && items.length > 0) {
          allMembers.push(...items);
          
          // Verificar se há mais páginas
          const totalPages = data.data?.total_pages || data.data?.lastPage || data.meta?.last_page || 0;
          const totalItems = data.data?.total || data.data?.total_items || data.meta?.total || 0;
          
          if (totalPages > 0) {
            hasMore = page < totalPages;
          } else if (totalItems > 0) {
            hasMore = allMembers.length < totalItems;
          } else {
            // Se retornou exatamente o limite, pode haver mais
            hasMore = items.length === limit;
          }
        } else {
          hasMore = false;
        }

        page++;
      }

      return { success: true, data: allMembers };
    } catch (error) {
      Logger.error(`❌ Erro ao buscar membros do grupo ${groupId}:`, error.message);
      return { success: false, error: error.message, data: allMembers };
    }
  }
  /**
   * Fetch a group's daily schedule for a specific date.
   * Primary source for "Quem está também" coworker data.
   *
   * GET /groups/{groupId}/calendar/daily/{YYYY-MM-DD}
   * Useful: data.dynamic_schedule[].label, data.dynamic_schedule[].shifts[].user
   */
  static async getGroupDailyCalendar(token, groupId, dateStr) {
    try {
      const url = `${API_BASE_URL}/groups/${groupId}/calendar/daily/${dateStr}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Origin': API_ORIGIN,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return { success: true, data: json.data || null };
    } catch (err) {
      Logger.warn(`[API] getGroupDailyCalendar ${groupId} ${dateStr}: ${err.message}`);
      return { success: false, data: null };
    }
  }

  /**
   * Fetch transactions for a set of groups on a specific date.
   * PRIMARY source for vacancy detection in "Quem está também".
   *
   * GET /transactions?groups[]=g1&groups[]=g2&date={YYYY-MM-DD}
   * Useful: type, data.label, data.time, data.available, data.total,
   *         group.id, group.institution
   */
  static async getTransactions(token, groupIds, dateStr) {
    try {
      const params = groupIds.map(id => `groups[]=${encodeURIComponent(id)}`).join('&');
      const url = `${API_BASE_URL}/transactions?${params}&date=${dateStr}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Origin': API_ORIGIN,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const items = json.data?.items || json.data || [];
      return { success: true, data: Array.isArray(items) ? items : [] };
    } catch (err) {
      Logger.warn(`[API] getTransactions: ${err.message}`);
      return { success: false, data: [] };
    }
  }

  /**
   * Fetch a single shift's full detail.
   * FALLBACK ONLY — use only when daily data is missing/incomplete for a specific shift.
   *
   * GET /groups/{groupId}/shifts/{shiftId}
   * Useful: data.coworkers[], data.label, data.start_date, data.group.institution
   */
  static async getShiftDetail(token, groupId, shiftId) {
    try {
      const url = `${API_BASE_URL}/groups/${groupId}/shifts/${shiftId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Origin': API_ORIGIN,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return { success: true, data: json.data || null };
    } catch (err) {
      Logger.warn(`[API] getShiftDetail ${groupId}/${shiftId}: ${err.message}`);
      return { success: false, data: null };
    }
  }
}

export default WebClientApiService;