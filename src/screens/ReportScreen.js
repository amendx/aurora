import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';
import AppHeader from '../components/AppHeader';

const getMonthKey = (date) => {
  // YYYY-MM
  return date.toISOString().slice(0, 7);
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
};

const formatMinutes = (min) => {
  const sign = min > 0 ? '+' : min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${m.toString().padStart(2, '0')}h`;
};

const getSaldoColor = (min) => {
  if (min > 0) return Colors.success;
  if (min < 0) return Colors.error;
  return Colors.text.tertiary;
};

const ReportScreen = () => {
  const [report, setReport] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Detectar modo dev/local
      const dev = await SecureStore.getItemAsync('dev_mode');
      setDevMode(dev === '1');
      // Buscar todas as chaves possíveis do mês vigente
      const now = new Date();
      const monthKey = getMonthKey(now);
      const dias = [];
      let totalMin = 0;
      for (let d = 1; d <= 31; d++) {
        const diaStr = `${monthKey}-${d.toString().padStart(2, '0')}`;
        const raw = await SecureStore.getItemAsync(`real_hours_${diaStr}`);
        if (raw) {
          const obj = JSON.parse(raw);
          // Agrupar todos os plantões do dia
          let saldoDia = 0;
          let hasValid = false;
          Object.values(obj).forEach((h) => {
            if (h && h.startTime && h.endTime) {
              // Calcular saldo
              const [ps, pe] = (h.shiftTime || '').split(/[-–]/).map(s => s.trim());
              const [rs, re] = [h.startTime, h.endTime];
              const toMin = (t) => {
                const [hh, mm] = t.replace('h', ':').split(':').map(Number);
                return hh * 60 + mm;
              };
              let prev = 0, real = 0;
              if (ps && pe) prev = toMin(pe) - toMin(ps) < 0 ? toMin(pe) - toMin(ps) + 24*60 : toMin(pe) - toMin(ps);
              if (rs && re) real = toMin(re) - toMin(rs) < 0 ? toMin(re) - toMin(rs) + 24*60 : toMin(re) - toMin(rs);
              const diff = real - prev;
              saldoDia += diff;
              hasValid = true;
            }
          });
          if (hasValid) {
            dias.push({ date: diaStr, saldo: saldoDia });
            totalMin += saldoDia;
          }
        }
      }
      dias.sort((a, b) => a.date.localeCompare(b.date));
      setReport(dias);
      setTotal(totalMin);
    } catch (e) {
      setReport([]);
      setTotal(0);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    Alert.alert('Limpar horas', 'Deseja realmente apagar todos os registros de horas do mês?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: async () => {
        const now = new Date();
        const monthKey = getMonthKey(now);
        for (let d = 1; d <= 31; d++) {
          const diaStr = `${monthKey}-${d.toString().padStart(2, '0')}`;
          await SecureStore.deleteItemAsync(`real_hours_${diaStr}`);
        }
        loadReport();
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Relatório" />
      <View style={styles.content}>
        {loading ? (
          <Text style={styles.emptyText}>Carregando...</Text>
        ) : report.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Nenhuma hora registrada neste mês</Text>
            <Text style={styles.emptySubtitle}>Registre seus horários para acompanhar seu saldo</Text>
            {devMode && (
              <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.clearButtonText}>Limpar horas</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <FlatList
              data={report}
              keyExtractor={item => item.date}
              contentContainerStyle={{ paddingBottom: 100 }}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
                  <Text style={[styles.cardSaldo, { color: getSaldoColor(item.saldo) }]}>{formatMinutes(item.saldo)}</Text>
                </View>
              )}
            />
            <View style={styles.footer}>
              <Text style={styles.footerLabel}>Saldo do mês</Text>
              <Text style={[styles.footerTotal, { color: getSaldoColor(total) }]}>{formatMinutes(total)}</Text>
              {devMode && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  <Text style={styles.clearButtonText}>Limpar horas</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 1 } })
  },
  cardDate: {
    fontSize: 15,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  cardSaldo: {
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    alignItems: 'center',
    padding: Spacing.lg,
    zIndex: 10,
  },
  footerLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  footerTotal: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 40,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.error + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error + '20',
    marginTop: Spacing.md,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

export default ReportScreen;
