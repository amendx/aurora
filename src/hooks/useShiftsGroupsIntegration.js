import { useEffect } from 'react';
import { useShifts } from '../contexts/ShiftsContext';
import { useGroups } from '../contexts/GroupsContext';
import Logger from '../utils/Logger';

/**
 * Hook personalizado para integrar dados entre ShiftsContext e GroupsContext
 * Automaticamente extrai grupos e colegas dos dados de plantões carregados
 */
export const useShiftsGroupsIntegration = () => {
  const { daysWithShifts, lastUpdated, loading } = useShifts();
  const { extractFromDailyShifts, loadGroups } = useGroups();

  useEffect(() => {
    // Só processar se temos dados de plantões e não estamos carregando
    if (!loading && daysWithShifts.length > 0 && lastUpdated) {
      Logger.info('🔗 Integrando dados de plantões com sistema de grupos...');
      
      try {
        // Extrair todos os turnos de todos os dias
        const allShifts = daysWithShifts.flatMap(day => day.shifts);
        
        // Extrair grupos e colegas dos turnos
        extractFromDailyShifts(allShifts);
        
        // Também carregar grupos completos da API
        loadGroups();
        
        Logger.info(`✅ Integração concluída - processados ${allShifts.length} turnos de ${daysWithShifts.length} dias`);
      } catch (error) {
        Logger.warn('⚠️ Erro na integração com grupos (não crítico):', error.message);
      }
    }
  }, [daysWithShifts, lastUpdated, loading, extractFromDailyShifts, loadGroups]);

  return {
    // Permite verificar se a integração está ativa
    isIntegrationActive: !loading && daysWithShifts.length > 0,
    shiftsCount: daysWithShifts.reduce((sum, day) => sum + day.shifts.length, 0),
  };
};

export default useShiftsGroupsIntegration;