import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { calculateShiftValueWithBreakdown, calculateShiftValue } from '../utils/ShiftValueCalculator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const BOTTOM_SHEET_MIN_HEIGHT = 0;

const ShiftBottomSheet = ({ 
  isVisible, 
  onClose, 
  shifts, 
  selectedDate,
  calculateShiftValue 
}) => {
  const translateY = useRef(new Animated.Value(BOTTOM_SHEET_MAX_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [shiftBreakdowns, setShiftBreakdowns] = useState({});

  // Carregar breakdowns quando shifts ou data mudarem
  useEffect(() => {
    const loadBreakdowns = async () => {
      if (!shifts || !selectedDate) return;
      
      const breakdowns = {};
      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i];
        try {
          // Não precisamos mais passar horas totais - sempre aplicar configuração ativa
          const result = await calculateShiftValueWithBreakdown(shift, selectedDate, 0);
          breakdowns[i] = result;
        } catch (error) {
          console.warn('Erro ao carregar breakdown para shift:', error);
          const simpleValue = calculateShiftValue ? calculateShiftValue(shift, selectedDate) : 0;
          breakdowns[i] = {
            baseValue: simpleValue,
            finalValue: simpleValue,
            hourlyValue: 130,
            hours: 6
          };
        }
      }
      setShiftBreakdowns(breakdowns);
    };
    
    if (isVisible) {
      loadBreakdowns();
    }
  }, [shifts, selectedDate, isVisible]);

  useEffect(() => {
    if (isVisible) {
      // Animar para cima
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animar para baixo
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: BOTTOM_SHEET_MAX_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      // Só responder se o toque inicial for no header ou handle (primeiros 100px)
      return evt.nativeEvent.locationY < 100;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Só responder a movimentos verticais significativos e se começou no header
      const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      const isInHeader = evt.nativeEvent.locationY < 100;
      return isVertical && isInHeader && Math.abs(gestureState.dy) > 10;
    },
    onPanResponderMove: (_, gestureState) => {
      // Só permitir movimento para baixo (fechar)
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        // Fechar se arrastou mais de 100px ou velocidade > 0.5
        onClose();
      } else {
        // Voltar para posição original
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('pt-BR', { month: 'long' });
    const year = date.getFullYear();
    
    return `${day} de ${month}, ${year}`;
  };

  const formatDateHeader = (dateString) => {
    if (!dateString) return '';
    try {
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      const dayMonth = date.toLocaleDateString('pt-BR', { 
        day: 'numeric',
        month: 'long'
      });
      
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayMonth}`;
    } catch (error) {
      return dateString;
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Horário não informado';
    return timeString;
  };

  const getShiftTypeLabel = (label) => {
    if (!label) return 'Plantão';
    
    const typeMap = {
      'M': 'Manhã',
      'T': 'Tarde', 
      'N': 'Noite'
    };
    
    const type = label.charAt(0);
    return typeMap[type] || label;
  };

  const getShiftTypeColor = (label) => {
    if (!label) return Colors.primary;
    
    const colorMap = {
      'M': Colors.success,
      'T': Colors.primary,
      'N': Colors.warning
    };
    
    const type = label.charAt(0);
    return colorMap[type] || Colors.primary;
  };

  const renderShiftCard = (shift, index) => {
    const breakdown = shiftBreakdowns[index];
    const shiftType = getShiftTypeLabel(shift.label);
    const shiftColor = getShiftTypeColor(shift.label);

    return (
      <View key={index} style={styles.shiftCard}>
        {/* Header do Card com Tipo e Valor */}
        <View style={styles.shiftHeader}>
          <View style={[styles.shiftTypeBadge, { backgroundColor: shiftColor + '15', borderColor: shiftColor + '30' }]}>
            <Text style={[styles.shiftTypeText, { color: shiftColor }]}>
              {shiftType}
            </Text>
          </View>
          
          <View style={styles.shiftValueContainer}>
            <Text style={styles.shiftValueText}>
              R$ {breakdown?.finalValue ? breakdown.finalValue.toFixed(2).replace('.', ',') : '0,00'}
            </Text>
            <Text style={styles.shiftValueLabel}>valor estimado</Text>
          </View>
        </View>

        {/* Detalhes do Plantão */}
        <View style={styles.shiftDetails}>
          <View style={styles.shiftDetailRow}>
            <Ionicons name="time-outline" size={18} color={Colors.text.tertiary} />
            <Text style={styles.shiftDetailText}>
              {formatTime(shift.time)}
            </Text>
          </View>

          {shift.group?.institution?.name && (
            <View style={styles.shiftDetailRow}>
              <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} />
              <Text style={styles.shiftDetailText}>
                {shift.group.institution.name}
              </Text>
            </View>
          )}

          {shift.group?.name && (
            <View style={styles.shiftDetailRow}>
              <Ionicons name="people-outline" size={18} color={Colors.text.tertiary} />
              <Text style={[styles.shiftDetailText, styles.groupText]}>
                {shift.group.name}
              </Text>
            </View>
          )}
        </View>

        {/* Linha divisória */}
        <View style={styles.divider} />

        {/* Composição do Valor - AGORA ABAIXO DAS INFORMAÇÕES */}
        {breakdown && (
          <View style={styles.calculationSummary}>
            <Text style={styles.summaryTitle}>💰 Composição do valor:</Text>
            <Text style={styles.summaryItem}>
              R$ {breakdown.hourlyValue?.toFixed(0) || '0'}/h × {breakdown.hours || 0}h 
              {breakdown.weekend && breakdown.isNaturalWeekend ? ' (FDS)' : ''}
              {breakdown.isFridayNight ? ' (Sexta N)' : ''} = R$ {breakdown.baseValue?.toFixed(2).replace('.', ',') || '0,00'}
            </Text>
            {breakdown.loyaltyBonus > 0 && (
              <Text style={[styles.summaryBonus, { color: Colors.primary }]}>
                + Fidelização {breakdown.loyaltyPercentage}% = R$ {breakdown.loyaltyBonus.toFixed(2).replace('.', ',')}
              </Text>
            )}
            {breakdown.generalBonus > 0 && (
              <Text style={[styles.summaryBonus, { color: Colors.success }]}>
                + Bônus {breakdown.generalBonusPercentage}% = R$ {breakdown.generalBonus.toFixed(2).replace('.', ',')}
              </Text>
            )}
            {breakdown.isFridayNight && (
              <Text style={[styles.summaryBonus, { color: Colors.warning }]}>
                (Sexta-feira (N) - aplicando valor de FDS)
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      {/* Backdrop */}
      <Animated.View 
        style={[
          styles.backdrop, 
          { opacity: backdropOpacity }
        ]}
      >
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { transform: [{ translateY }] }
        ]}
      >
        {/* Área de gesto para fechar - apenas handle e header */}
        <View style={styles.gestureArea} {...panResponder.panHandlers}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.dateTitle}>{formatDateHeader(selectedDate)}</Text>
              <Text style={styles.shiftsCountText}>
                {shifts.length} {shifts.length === 1 ? 'plantão agendado' : 'plantões agendados'}
              </Text>
            </View>
            
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text.secondary} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false} // Remove bounce para evitar conflito
          scrollEventThrottle={16} // Melhora performance
          keyboardShouldPersistTaps="handled" // Melhora interação
          nestedScrollEnabled={true} // Permite scroll aninhado no Android
          overScrollMode="never" // Android: evita overscroll
        >
          {shifts && shifts.length > 0 ? (
            shifts.map((shift, index) => renderShiftCard(shift, index))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Nenhum plantão</Text>
              <Text style={styles.emptySubtitle}>Não há plantões agendados para este dia</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.shadow.overlay,
  },

  backdropPressable: {
    flex: 1,
  },

  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: BOTTOM_SHEET_MAX_HEIGHT,
    minHeight: 200,
    ...Shadows.strong,
  },

  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border.medium,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.light,
  },

  headerContent: {
    flex: 1,
  },

  dateTitle: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text.primary,
    marginBottom: 2,
  },

  shiftsCountText: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
    textTransform: 'lowercase',
  },

  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl + 34, // Safe area bottom
  },

  // Shift Card
  shiftCard: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.small,
  },

  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },

  shiftTypeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },

  shiftTypeText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.bold,
  },

  shiftValueContainer: {
    alignItems: 'flex-end',
  },

  shiftValueText: {
    fontSize: Typography.fontSize.title2,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
    marginBottom: 2,
  },

  shiftValueLabel: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.tertiary,
    fontWeight: Typography.fontWeight.medium,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border.light,
    marginHorizontal: Spacing.lg,
  },

  shiftDetails: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },

  shiftDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  shiftDetailText: {
    fontSize: Typography.fontSize.body,
    color: Colors.text.secondary,
    flex: 1,
    fontWeight: Typography.fontWeight.medium,
  },

  groupText: {
    color: Colors.text.tertiary,
    fontSize: Typography.fontSize.footnote,
  },

  // Calculation Summary
  calculationSummary: {
    backgroundColor: Colors.info + '08',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg, // Adiciona margem no final
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    borderRightWidth: 3,
    borderRightColor: Colors.info,
  },

  summaryTitle: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },

  summaryItem: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: 2,
  },

  summaryBonus: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: 2,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },

  emptyTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },

  emptySubtitle: {
    fontSize: Typography.fontSize.subhead,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});

export default ShiftBottomSheet;