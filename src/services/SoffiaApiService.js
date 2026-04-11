const API_BASE_URL = 'https://api.plantaoativo.com';
import Logger from '../utils/Logger';
import { MOCK_USER_DATA, MOCK_CALENDAR_DATA, MOCK_DETAILED_SHIFTS } from '../mocks/MockDataReal';

const MOCK_TOKEN = 'mock_token_for_development';
const DEMO_EMAIL = 'demo@cemhoras.com';

export class SoffiaApiService {
  // Retorna true quando o token é o token local de desenvolvimento
  static isMockToken(token) {
    return !token || token === MOCK_TOKEN;
  }

  static async login(email, password) {
    // Login local (demo) - retorna dados mockados sem chamar API
    if (email === DEMO_EMAIL) {
      Logger.info('🧪 LOGIN LOCAL - Usando dados mockados');
      await new Promise(resolve => setTimeout(resolve, 800));

      const mockResponse = {
        message: 'Seu login foi efetuado com sucesso.',
        data: { ...MOCK_USER_DATA, token: MOCK_TOKEN },
      };

      Logger.info('✅ Login local realizado com sucesso');
      Logger.loginSuccess(email, mockResponse);
      return mockResponse;
    }
    
    // Código original da API (quando MOCK_MODE = false)
    const loginUrl = `${API_BASE_URL}/auth/login`;
    
    // Log da tentativa de login
    Logger.loginAttempt(email, loginUrl);
    Logger.userInput('email', email);
    Logger.userInput('senha', password, true); // senha mascarada

    try {
      Logger.info(`🌐 Fazendo requisição para: ${loginUrl}`);
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
        body: JSON.stringify({
          login: email,
          password: password,
        }),
      });

      Logger.info(`📡 Resposta recebida - Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        const errorMsg = errorData.message || `Erro HTTP ${response.status}`;
        Logger.loginError(email, errorMsg, loginUrl);
        throw new Error(errorMsg);
      }

      const responseText = await response.text();
      Logger.info(`📦 Resposta completa da API: ${responseText}`);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse da resposta JSON:', parseError.message);
        data = { rawResponse: responseText, email: email };
      }
      
      Logger.loginSuccess(email, data);
      
      return {
        success: true,
        data,
      };
    } catch (error) {
      Logger.loginError(email, error.message, loginUrl);
      return {
        success: false,
        error: error.message || 'Erro de conexão',
      };
    }
  }

  static async logout(token) {
    // Login local não tem sessão na API
    if (this.isMockToken(token)) {
      Logger.info('🧪 Logout local - nenhuma chamada à API necessária');
      return { success: true };
    }

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
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
      });

      Logger.info(`📡 Resposta logout recebida - Status: ${response.status}`);

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
    
    // Token local → retorna dados mockados
    if (this.isMockToken(token)) {
      Logger.info('🧪 TOKEN LOCAL - Usando dados mockados de calendário');
      Logger.info(`📅 Buscando plantões mockados para: ${targetMonth}/${targetYear}`);
      
      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
      
      // Para março de 2026, usar os dados mockados
      if (monthKey === '2026-03') {
        Logger.info(`✅ Dados mockados encontrados para ${monthKey}`);
        Logger.info(`📦 Resposta calendário mockada para ${targetMonth}/${targetYear}`);
        
        // Debug: contar plantões nos dados brutos
        if (MOCK_CALENDAR_DATA && MOCK_CALENDAR_DATA.data && MOCK_CALENDAR_DATA.data.current && MOCK_CALENDAR_DATA.data.current.days) {
          const days = MOCK_CALENDAR_DATA.data.current.days;
          let totalPlantoes = 0;
          days.forEach(day => {
            if (day.shifts && Array.isArray(day.shifts)) {
              totalPlantoes += day.shifts.length;
            }
          });
          Logger.info(`🔢 DADOS BRUTOS: ${days.length} dias, ${totalPlantoes} plantões totais`);
        }
        
        return {
          success: true,
          data: MOCK_CALENDAR_DATA,
          year: targetYear,
          month: targetMonth,
        };
      } else {
        Logger.warn(`⚠️ Dados mockados não encontrados para ${monthKey}, retornando estrutura vazia`);
        return {
          success: true,
          data: {
            data: {
              previous: { month: `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`, days: [] },
              current: { month: monthKey, days: [] },
              next: { month: `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`, days: [] }
            }
          },
          year: targetYear,
          month: targetMonth,
        };
      }
    }
    
    // API Real - Endpoints disponíveis:
    // 1. https://api.plantaoativo.com/users/calendar/monthly/2026-03 (mês específico)
    // 2. https://api.plantaoativo.com/users/calendar/monthly (mês atual + previous/next)
    
    const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const calendarUrl = `${API_BASE_URL}/users/calendar/monthly/${monthKey}`;
    
    Logger.info(`📅 Buscando calendário mensal: ${targetMonth}/${targetYear}`);
    Logger.info(`🌐 URL: ${calendarUrl}`);
    
    try {
      const response = await fetch(calendarUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
      });

      Logger.info(`📡 Resposta calendário - Status: ${response.status}`);

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
      Logger.info(`📦 Resposta calendário: ${responseText.substring(0, 500)}...`);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse do calendário:', parseError.message);
        throw new Error('Erro ao processar resposta do calendário');
      }
      
      Logger.info(`✅ Calendário carregado com sucesso - ${data.length || 'N/A'} itens`);
      
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
    if (this.isMockToken(token)) {
      Logger.info('🧪 TOKEN LOCAL - Usando dados mockados de calendário genérico');
      
      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Retornar dados mockados do mês atual (março 2026)
      const currentMonthKey = '2026-03';
      const mockData = MOCK_CALENDAR_DATA[currentMonthKey];
      
      if (mockData) {
        return {
          success: true,
          data: mockData,
        };
      }
    }
    
    // API Real - Endpoint genérico
    // https://api.plantaoativo.com/users/calendar/monthly
    const calendarUrl = `${API_BASE_URL}/users/calendar/monthly`;
    
    Logger.info(`📅 Buscando calendário mensal genérico (current + previous + next)`);
    Logger.info(`🌐 URL: ${calendarUrl}`);
    
    try {
      const response = await fetch(calendarUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
      });

      Logger.info(`📡 Resposta calendário genérico - Status: ${response.status}`);

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
      Logger.info(`📦 Resposta calendário genérico: ${responseText.substring(0, 500)}...`);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse da resposta JSON:', parseError.message);
        throw new Error('Resposta inválida do servidor');
      }
      
      Logger.info(`✅ Calendário genérico obtido com sucesso`);
      
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
      
      Logger.info(`🎯 Dias com plantões encontrados no monthly: ${daysWithShifts.length}`);
      Logger.info(`📋 Lista: ${daysWithShifts.map(d => `${d.date} (${d.shifts.length})`).join(', ')}`);
      
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
          
          Logger.info(`📦 ${dayInfo.date}: ${dayShifts.length} plantão(s) detalhado(s)`);
        }
      }
      
      Logger.info(`🎯 RESUMO OTIMIZADO: ${monthlyData.totalShifts} plantões em ${monthlyData.daysWithShifts} dias`);
      
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
    
    // Token local → retorna dados mockados
    if (this.isMockToken(token)) {
      Logger.info('🧪 TOKEN LOCAL - Usando dados mockados de plantões diários');
      Logger.info(`📅 Buscando plantões mockados para: ${dateStr}`);
      
      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const mockData = MOCK_DETAILED_SHIFTS[dateStr];
      
      if (mockData) {
        Logger.info(`✅ Plantões detalhados encontrados para ${dateStr}`);
        Logger.info(`📦 ${mockData.data.items.length} plantão(s) encontrado(s)`);
        
        // Log detalhado dos plantões
        mockData.data.items.forEach((shift, index) => {
          Logger.info(`  ${index + 1}. ${shift.time} - Grupo: ${shift.group.name} (${shift.group.color})`);
        });
        
        return {
          success: true,
          data: mockData.data.items,
          date: dateStr,
        };
      } else {
        Logger.info(`ℹ️ Nenhum plantão mockado encontrado para ${dateStr}`);
        return {
          success: true,
          data: [],
          date: dateStr,
        };
      }
    }
    
    // Código original da API (quando MOCK_MODE = false)
    const dailyUrl = `${API_BASE_URL}/users/calendar/daily/${dateStr}`;
    
    Logger.info(`📅 Buscando plantões do dia: ${dateStr}`);
    Logger.info(`🌐 URL: ${dailyUrl}`);
    
    try {
      const response = await fetch(dailyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Origin': 'web.soffia.co',
          'Authorization': `Bearer ${token}`,
        },
      });

      Logger.info(`📡 Resposta plantões diários - Status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      Logger.info('📦 Resposta plantões diários:', responseText.substring(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        Logger.error('❌ Erro ao fazer parse dos plantões diários:', parseError.message);
        throw new Error('Erro ao processar resposta dos plantões diários');
      }
      
      // A API retorna os dados em data.data.items
      const shifts = data.data?.items || [];
      Logger.info(`✅ Plantões diários carregados - ${shifts.length} plantões`);
      
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
  static async getGroups(token) {
    if (this.isMockToken(token)) {
      Logger.info('🧪 TOKEN LOCAL - Usando grupos mockados');
      
      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const mockGroups = {
        data: {
          items: [
            {
              id: 1,
              name: "UTI Adulto",
              is_personal: false,
              is_removed: false,
              color: "#4CAF50",
              logo: null,
              is_admin: true,
              total_users: 8,
              created_at: "2023-01-15T10:00:00Z",
              has_workingtime: true,
              has_amount: true,
              unread_notices: 2,
              institution: {
                id: 1,
                name: "Hospital São José",
                category: {
                  id: 1,
                  name: "Hospital"
                }
              },
              manager: {
                id: 1,
                username: "dr.silva",
                name: "Dr. Silva",
                full_name: "Dr. João Silva",
                photo: null,
                description: "Coordenador UTI",
                council: "CRM/SP 123456",
                status: "active",
                phone: "(11) 99999-9999",
                email: "dr.silva@hospital.com",
                role: "Médico",
                is_premium: true
              },
              assists: [
                {
                  id: 2,
                  name: "Dra. Maria",
                  full_name: "Dra. Maria Santos",
                  photo: null,
                  council: "CRM/SP 789012",
                  email: "maria@hospital.com",
                  phone: "(11) 88888-8888",
                  role: "Médica"
                }
              ],
              analysts: [
                {
                  id: 3,
                  name: "Enfermeiro João",
                  full_name: "João da Silva",
                  photo: null,
                  council: "COREN/SP 345678",
                  email: "joao@hospital.com",
                  phone: "(11) 77777-7777",
                  role: "Enfermeiro"
                }
              ],
              observers: []
            },
            {
              id: 2,
              name: "Plantão Particular",
              is_personal: true,
              is_removed: false,
              color: "#2196F3",
              logo: null,
              is_admin: false,
              total_users: 3,
              created_at: "2023-03-01T14:30:00Z",
              has_workingtime: false,
              has_amount: true,
              unread_notices: 0,
              institution: {
                id: 2,
                name: "Clínica Particular",
                category: {
                  id: 2,
                  name: "Clínica"
                }
              },
              manager: {
                id: 4,
                name: "Dr. Carlos",
                full_name: "Dr. Carlos Oliveira",
                photo: null,
                council: "CRM/SP 456789",
                email: "carlos@clinica.com",
                role: "Médico"
              },
              assists: [],
              analysts: [],
              observers: [
                {
                  id: 5,
                  name: "Ana Paula",
                  full_name: "Ana Paula Costa",
                  photo: null,
                  email: "ana@clinica.com",
                  role: "Administradora"
                }
              ]
            }
          ]
        }
      };
      
      Logger.info(`✅ Grupos mockados carregados - ${mockGroups.data.items.length} grupos`);
      return mockGroups;
    }

    // API real — busca com paginação (20 por página, busca todas as páginas)
    const groupsUrl = `${API_BASE_URL}/groups?page=1&limit=100`;

    try {
      Logger.info(`🌐 Fazendo requisição para grupos: ${groupsUrl}`);
      
      const response = await fetch(groupsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      Logger.debug('📦 Resposta grupos:', JSON.stringify(data, null, 2));
      
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
    if (this.isMockToken(token)) {
      Logger.info(`🧪 TOKEN LOCAL - Grupo mockado: ${groupId}`);
      return { success: true, data: null }; // sem dados mock por grupo
    }

    const url = `${API_BASE_URL}/groups/${groupId}`;
    Logger.info(`🌐 Buscando grupo: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Version': '2.0',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://web.soffia.co',
          'Referer': 'https://web.soffia.co/',
          'User-Agent': 'CemHoras-Mobile-App/1.0.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      Logger.info(`✅ Grupo ${groupId} carregado`);
      return { success: true, data: data.data };
    } catch (error) {
      Logger.error(`❌ Erro ao buscar grupo ${groupId}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export default SoffiaApiService;