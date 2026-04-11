import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Animated,
  useColorScheme,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import COLORS from '../constants/Colors';

// Componente Skeleton para loading sutil
const SkeletonLoader = ({ width = '100%', height = 20, style = {} }) => {
  const animatedValue = new Animated.Value(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.3],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: '#E0E0E0',
          borderRadius: 4,
          opacity,
        },
        style,
      ]}
    />
  );
};

export default function HomeScreen() {
  const isDarkMode = useColorScheme() === 'dark';
  const { user, logout } = useContext(AuthContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Usar contexto global de plantões
  const {
    hoursReport,
    totalShifts,
    daysWithShifts,
    loading: loadingShifts,
    error: shiftsError,
    loadMonthlyShifts,
    hasDataFor
  } = useShifts();
  
  // Usar currentDate para gerar currentMonth
  const currentMonth = `${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível realizar logout');
    }
  };

  const goToPreviousMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  // Carregar dados quando o mês mudar
  useEffect(() => {
    if (!hasDataFor(month, year)) {
      console.log(`� HomeScreen: Carregando dados para ${month}/${year}`);
      loadMonthlyShifts(month, year);
    } else {
      console.log(`🏠 HomeScreen: Usando dados em cache para ${month}/${year}`);
    }
  }, [month, year]);

  const renderStatsGrid = () => {
    if (loadingShifts) {
      return (
        <View style={styles.statsGrid}>
          {[1, 2, 3].map((item, index) => (
            <View key={index} style={styles.statCard}>
              <SkeletonLoader width={100} height={16} style={{ marginRight: 16, borderRadius: 4 }} />
              <SkeletonLoader width={30} height={18} style={{ marginRight: 16, borderRadius: 4 }} />
              <SkeletonLoader width={40} height={14} style={{ borderRadius: 4 }} />
            </View>
          ))}
        </View>
      );
    }

    if (!hoursReport?.breakdown) {
      return (
        <View style={styles.statsGrid}>
          <Text style={styles.noDataText}>Nenhum plantão encontrado para este mês</Text>
        </View>
      );
    }

    const { breakdown } = hoursReport;
    const stats = [
      { 
        title: 'Manhã (M)', 
        count: breakdown.M?.count || 0, 
        hours: breakdown.M?.hours || 0,
        color: COLORS.SUCCESS 
      },
      { 
        title: 'Tarde (T)', 
        count: breakdown.T?.count || 0, 
        hours: breakdown.T?.hours || 0,
        color: COLORS.WARNING 
      },
      { 
        title: 'Noite (N)', 
        count: breakdown.N?.count || 0, 
        hours: breakdown.N?.hours || 0,
        color: COLORS.ERROR 
      },
    ];

    return (
      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <View key={index} style={[styles.statCard, { borderLeftColor: stat.color }]}>
            <Text style={styles.statTitle}>{stat.title}</Text>
            <Text style={styles.statCount}>{stat.count}</Text>
            <Text style={styles.statHours}>{stat.hours}h</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderMonthSelector = () => {
    return (
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthButton}>
          <Text style={styles.monthButtonText}>‹</Text>
        </TouchableOpacity>
        
        <View style={styles.monthDisplay}>
          <Text style={styles.monthTitle}>
            {currentDate.toLocaleDateString('pt-BR', { 
              month: 'long', 
              year: 'numeric' 
            }).toUpperCase()}
          </Text>
        </View>
        
        <TouchableOpacity onPress={goToNextMonth} style={styles.monthButton}>
          <Text style={styles.monthButtonText}>›</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const formatMonthYear = (monthYear) => {
    const [month, year] = monthYear.split('/');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  if (loadingShifts) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDarkMode && styles.containerDark]}>
      <StatusBar 
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={isDarkMode ? COLORS.BACKGROUND_DARK : COLORS.BACKGROUND}
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Espaçamento superior */}
        <View style={styles.headerSpacing} />
        
        {/* Cartão de Boas-vindas */}
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>Olá, {user?.name || user?.nome || 'Usuário'}!</Text>
          <Text style={styles.welcomeSubtext}>
            Aqui está o resumo dos seus plantões
          </Text>
        </View>

        {/* Total de Horas do Mês */}
        <View style={styles.totalHoursCard}>
          <Text style={styles.cardTitle}>Horas do Mês</Text>
          
          {/* Seletor de Mês */}
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </TouchableOpacity>
            
            <View style={styles.monthDisplay}>
              <Text style={styles.monthTitle}>
                {currentDate.toLocaleDateString('pt-BR', { 
                  month: 'long', 
                  year: 'numeric' 
                }).toUpperCase()}
              </Text>
            </View>
            
            <TouchableOpacity onPress={goToNextMonth} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>›</Text>
            </TouchableOpacity>
          </View>
          
          {loadingShifts ? (
            <View style={styles.hoursContainer}>
              <SkeletonLoader width={120} height={36} style={{ marginBottom: 8, borderRadius: 8 }} />
              <SkeletonLoader width={80} height={16} style={{ borderRadius: 6 }} />
            </View>
          ) : (
            <View style={styles.hoursContainer}>
              <Text style={styles.totalHours}>
                {hoursReport?.realHours || 0}h
              </Text>
              <Text style={styles.totalShifts}>
                {totalShifts || 0} plantões
              </Text>
            </View>
          )}
        </View>

        {/* Grid de Estatísticas */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Distribuição de Plantões</Text>
            <Text style={styles.cardSubtitle}>
              {totalShifts || 0} plantões no mês
            </Text>
          </View>
          {renderStatsGrid()}
        </View>

        {/* Informações do Usuário */}
        <View style={styles.userCard}>
          <Text style={styles.cardTitle}>Perfil</Text>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Nome:</Text>
            <Text style={styles.userValue}>{user?.name || user?.nome || 'N/A'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Email:</Text>
            <Text style={styles.userValue}>{user?.email || 'N/A'}</Text>
          </View>
        </View>

        {/* Botão de Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
        
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  containerDark: {
    backgroundColor: COLORS.BACKGROUND_DARK,
  },
  headerSpacing: {
    height: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  appBar: {
    backgroundColor: COLORS.TEXT_SECONDARY,
    paddingTop: 0,
    paddingBottom: 16,
    paddingTop: 16,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  totalHoursCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    alignItems: 'center',
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 16,
  },
  hoursContainer: {
    alignItems: 'center',
  },
  totalHours: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.PRIMARY,
    marginBottom: 4,
  },
  totalShifts: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statsGrid: {
    marginTop: 16,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  statTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
  },
  statCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginRight: 16,
  },
  statHours: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    minWidth: 40,
    textAlign: 'right',
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  userLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_SECONDARY,
    width: 60,
  },
  userValue: {
    flex: 1,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
  },
  logoutButton: {
    backgroundColor: COLORS.ERROR,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacer: {
    height: 20,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  monthButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  monthDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    textAlign: 'center',
  },
});