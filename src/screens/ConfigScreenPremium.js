import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Colors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

export default function ConfigScreenPremium({ navigation }) {
  const [hourValues, setHourValues] = useState({
    weekday: { day: 130, night: 140 },
    weekend: { day: 150, night: 160 },
  });

  // Carregar configurações salvas quando o componente for montado
  React.useEffect(() => {
    loadSavedConfigurations();
  }, []);

  const loadSavedConfigurations = async () => {
    try {
      const savedConfig = await SecureStore.getItemAsync('shift_configurations');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        console.log('Configurações carregadas:', parsedConfig);
        
        if (parsedConfig.hourValues) {
          setHourValues(parsedConfig.hourValues);
        }
        if (parsedConfig.loyaltyEnabled !== undefined) {
          setLoyaltyEnabled(parsedConfig.loyaltyEnabled);
        }
        if (parsedConfig.loyaltyOptions) {
          setLoyaltyOptions(parsedConfig.loyaltyOptions);
        }
        if (parsedConfig.bonusEnabled !== undefined) {
          setBonusEnabled(parsedConfig.bonusEnabled);
        }
        if (parsedConfig.bonus) {
          setBonus(parsedConfig.bonus);
        }
        if (parsedConfig.fridayNightAsWeekend !== undefined) {
          setFridayNightAsWeekend(parsedConfig.fridayNightAsWeekend);
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar configurações:', error);
    }
  };

  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyOptions, setLoyaltyOptions] = useState([
    { percentage: 10, minHours: 72, active: false },
    { percentage: 20, minHours: 120, active: false },
    { percentage: 25, minHours: 168, active: false },
    { percentage: 30, minHours: 264, active: false },
  ]);

  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonus, setBonus] = useState({
    percentage: 20,
    startMonth: 2,
    endMonth: 4,
  });

  const [fridayNightAsWeekend, setFridayNightAsWeekend] = useState(false);

  const handleHourChange = (period, type, value) => {
    setHourValues((prev) => ({
      ...prev,
      [period]: {
        ...prev[period],
        [type]: value,
      },
    }));
  };

  const handleLoyaltyOptionToggle = (index) => {
    setLoyaltyOptions((prev) =>
      prev.map((option, i) => ({
        ...option,
        active: i === index ? !option.active : false,
      }))
    );
  };

  const handleBonusChange = (field, value) => {
    setBonus((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const getMonthName = (monthNumber) => {
    const months = [
      '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    return months[monthNumber] || '';
  };

  const saveConfigurations = async () => {
    try {
      const configData = {
        hourValues,
        loyaltyEnabled,
        loyaltyOptions,
        bonusEnabled,
        bonus,
        fridayNightAsWeekend,
        savedAt: new Date().toISOString(),
      };
      
      await SecureStore.setItemAsync('shift_configurations', JSON.stringify(configData));
      
      Alert.alert(
        'Configurações Salvas',
        'Suas configurações foram salvas com sucesso!',
        [{ text: 'OK', style: 'default' }]
      );
      console.log('Configurações salvas:', configData);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      Alert.alert(
        'Erro',
        'Não foi possível salvar as configurações. Tente novamente.',
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const resetToDefaults = () => {
    Alert.alert(
      'Restaurar Configurações',
      'Tem certeza que deseja restaurar as configurações padrão?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: () => {
            setHourValues({
              weekday: { day: 130, night: 140 },
              weekend: { day: 150, night: 160 },
            });
            setLoyaltyEnabled(false);
            setLoyaltyOptions([
              { percentage: 10, minHours: 72, active: false },
              { percentage: 20, minHours: 120, active: false },
              { percentage: 25, minHours: 168, active: false },
              { percentage: 30, minHours: 264, active: false },
            ]);
            setBonusEnabled(false);
            setBonus({ percentage: 20, startMonth: 2, endMonth: 4 });
            setFridayNightAsWeekend(false);
          },
        },
      ]
    );
  };

  // GroupsScreen structure: groupCard > groupHeader (titleRow + stats) > groupMembers > memberCard rows
  const renderShiftInputField = (label, value, onChangeText, prefix = 'R$') => (
    <View style={styles.shiftFieldRow}>
      <View style={styles.shiftFieldInfo}>
        <Text style={styles.shiftFieldName}>{label}</Text>
        <Text style={styles.shiftFieldRole}>Valor por hora</Text>
      </View>
      <View style={styles.shiftFieldInput}>
        <Text style={styles.shiftInputPrefix}>{prefix}</Text>
        <TextInput
          style={styles.shiftTextInput}
          value={String(value || '')}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder="0,00"
          placeholderTextColor={Colors.text.placeholder}
          selectTextOnFocus={true}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Menu de Navegação */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="menu-outline" size={20} color={Colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Menu</Text>
          </View>
          
          <Pressable
            style={styles.menuItem}
            onPress={() => navigation.navigate('GroupsScreen')}
          >
            <View style={styles.menuItemContent}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="people" size={20} color={Colors.primary} />
              </View>
              <View style={styles.menuItemInfo}>
                <Text style={styles.menuItemTitle}>Grupos</Text>
                <Text style={styles.menuItemDescription}>
                  Visualize seus grupos e colegas de plantão
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
          </Pressable>
        </View>

        {/* Valores durante a semana */}
        <View style={styles.valueCard}>
          <View style={styles.valueCardHeader}>
            <View style={styles.valueInfo}>
              <View style={styles.valueTitleRow}>
                <View style={[styles.valueColorDot, { backgroundColor: Colors.primary }]} />
                <Text style={styles.valueName}>Valores durante a semana</Text>
              </View>
              <View style={styles.valueStats}>
                <View style={styles.valueStatItem}>
                  <MaterialCommunityIcons name="calendar-outline" size={16} color={Colors.text.secondary} />
                  <Text style={styles.valueStatText}>2 turnos</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.valueFields}>
            {renderShiftInputField('Manhã / Tarde', hourValues.weekday.day, (v) => handleHourChange('weekday', 'day', v))}
            {renderShiftInputField('Noite', hourValues.weekday.night, (v) => handleHourChange('weekday', 'night', v))}
          </View>
        </View>

        {/* Valores fim de semana */}
        <View style={styles.valueCard}>
          <View style={styles.valueCardHeader}>
            <View style={styles.valueInfo}>
              <View style={styles.valueTitleRow}>
                <View style={[styles.valueColorDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.valueName}>Valores fim de semana</Text>
              </View>
              <View style={styles.valueStats}>
                <View style={styles.valueStatItem}>
                  <MaterialCommunityIcons name="calendar" size={16} color={Colors.text.secondary} />
                  <Text style={styles.valueStatText}>2 turnos</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.valueFields}>
            {renderShiftInputField('Manhã / Tarde', hourValues.weekend.day, (v) => handleHourChange('weekend', 'day', v))}
            {renderShiftInputField('Noite', hourValues.weekend.night, (v) => handleHourChange('weekend', 'night', v))}
          </View>
        </View>

        {/* Configurações adicionais */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="settings-outline" size={20} color={Colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Configurações adicionais</Text>
          </View>

          {/* Fidelização */}
          <View style={styles.featureContainer}>
            <View style={styles.featureHeader}>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Fidelização</Text>
                <Text style={styles.featureDescription}>
                  Bônus baseado em horas trabalhadas no mês
                </Text>
              </View>
              <Switch
                value={loyaltyEnabled}
                onValueChange={setLoyaltyEnabled}
                trackColor={{ 
                  false: Colors.interactive.disabled, 
                  true: Colors.primary + '40' 
                }}
                thumbColor={loyaltyEnabled ? Colors.primary : Colors.background.primary}
              />
            </View>
            
            {loyaltyEnabled && (
              <View style={styles.optionsContainer}>
                {loyaltyOptions.map((option, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.optionItem,
                      option.active && styles.optionItemActive,
                    ]}
                    onPress={() => handleLoyaltyOptionToggle(index)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionTitle,
                        option.active && styles.optionTitleActive,
                      ]}>
                        {option.percentage}% de Bônus
                      </Text>
                      <Text style={[
                        styles.optionSubtitle,
                        option.active && styles.optionSubtitleActive,
                      ]}>
                        Para ≥ {option.minHours} horas no mês
                      </Text>
                    </View>
                    <View style={[
                      styles.radioButton,
                      option.active && styles.radioButtonActive,
                    ]}>
                      {option.active && (
                        <Ionicons name="checkmark" size={12} color={Colors.background.primary} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Bônus Geral */}
          <View style={styles.featureContainer}>
            <View style={styles.featureHeader}>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Bônus geral</Text>
                <Text style={styles.featureDescription}>
                  Percentual adicional por período específico
                </Text>
              </View>
              <Switch
                value={bonusEnabled}
                onValueChange={setBonusEnabled}
                trackColor={{ 
                  false: Colors.interactive.disabled, 
                  true: Colors.success + '40' 
                }}
                thumbColor={bonusEnabled ? Colors.success : Colors.background.primary}
              />
            </View>
            
            {bonusEnabled && (
              <View style={styles.bonusContainer}>
                <View style={styles.inputGrid}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Percentual</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.textInput}
                        value={String(bonus.percentage || '')}
                        onChangeText={(value) => handleBonusChange('percentage', value)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.text.placeholder}
                      />
                      <Text style={styles.inputSuffix}>%</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.periodLabel}>Período de Vigência</Text>
                <View style={styles.inputGrid}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Mês Inicial</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.textInput}
                        value={String(bonus.startMonth || '')}
                        onChangeText={(value) => handleBonusChange('startMonth', value)}
                        keyboardType="numeric"
                        placeholder="1"
                        placeholderTextColor={Colors.text.placeholder}
                      />
                    </View>
                  </View>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Mês Final</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.textInput}
                        value={String(bonus.endMonth || '')}
                        onChangeText={(value) => handleBonusChange('endMonth', value)}
                        keyboardType="numeric"
                        placeholder="12"
                        placeholderTextColor={Colors.text.placeholder}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.calculationCard}>
                  <Text style={styles.calculationTitle}>📊 Exemplo de Cálculo</Text>
                  <Text style={styles.calculationText}>
                    Valor base: R$ {parseFloat(hourValues.weekday.day || 0).toFixed(2)} (Dia - Semana)
                  </Text>
                  <Text style={styles.calculationText}>
                    Com bônus ({parseFloat(bonus.percentage || 0)}%): R$ {(parseFloat(hourValues.weekday.day || 0) + (parseFloat(hourValues.weekday.day || 0) * parseFloat(bonus.percentage || 0) / 100)).toFixed(2)}
                  </Text>
                  <Text style={styles.calculationText}>
                    Vigência: {getMonthName(parseInt(bonus.startMonth) || 1)} a {getMonthName(parseInt(bonus.endMonth) || 1)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Sexta-feira Noturna */}
          <View style={styles.featureContainer}>
            <View style={styles.featureHeader}>
              <View style={styles.featureInfo}>
                <Text style={styles.featureTitle}>Sexta-feira Noturna</Text>
                <Text style={styles.featureDescription}>
                  Aplicar valor de fim de semana para plantões noturnos de sexta
                </Text>
              </View>
              <Switch
                value={fridayNightAsWeekend}
                onValueChange={setFridayNightAsWeekend}
                trackColor={{ 
                  false: Colors.interactive.disabled, 
                  true: Colors.warning + '40' 
                }}
                thumbColor={fridayNightAsWeekend ? Colors.warning : Colors.background.primary}
              />
            </View>
            
            {fridayNightAsWeekend && (
              <View style={styles.calculationCard}>
                <Text style={styles.calculationTitle}>🌙 Regra Especial</Text>
                <Text style={styles.calculationText}>
                  Plantões noturnos de sexta-feira usarão valores de fim de semana
                </Text>
                <Text style={styles.calculationText}>
                  Valor noturno sexta: R$ {parseFloat(hourValues.weekend.night || 0).toFixed(2)}/h (igual ao FDS)
                </Text>
                <Text style={styles.calculationText}>
                  Valor para 12h: R$ {(parseFloat(hourValues.weekend.night || 0) * 12).toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable 
            style={[styles.button, styles.resetButton]}
            onPress={resetToDefaults}
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.error} />
            <Text style={styles.resetButtonText}>Restaurar Padrões</Text>
          </Pressable>
          
          <Pressable 
            style={[styles.button, styles.saveButton]}
            onPress={saveConfigurations}
          >
            <Ionicons name="checkmark-outline" size={18} color={Colors.background.primary} />
            <Text style={styles.saveButtonText}>Salvar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  
  scrollView: {
    flex: 1,
  },
  
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Section Card (seguindo padrão HomeScreenPremium)
  sectionCard: {
    backgroundColor: Colors.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    ...Shadows.medium,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  cardIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },

  cardTitle: {
    fontSize: Typography.fontSize.headline,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
  },

  // ── Shift Value Cards (structure copied from GroupsScreen) ──────────────
  // groupCard
  valueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // groupHeader
  valueCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  // groupInfo
  valueInfo: {
    flex: 1,
  },
  // groupTitleRow
  valueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  // groupColorDot
  valueColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  // groupName
  valueName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  // groupStats
  valueStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: 24,
  },
  // statItem
  valueStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // statText
  valueStatText: {
    fontSize: 12,
    color: '#64748b',
  },
  // groupMembers
  valueFields: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  // memberCard
  shiftFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  // memberInfo
  shiftFieldInfo: {
    flex: 1,
  },
  // memberName
  shiftFieldName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  // memberRole
  shiftFieldRole: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  // memberActions area — input on the right
  shiftFieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  shiftInputPrefix: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginRight: 4,
  },
  shiftTextInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    minWidth: 64,
  },
  // ────────────────────────────────────────────────────────────────────────

  // Menu Item Styles
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.secondary + '50',
    marginBottom: Spacing.xs,
  },

  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },

  menuItemInfo: {
    flex: 1,
  },

  menuItemTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 2,
  },

  menuItemDescription: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
  },

  // Input Grid (2 campos por linha)
  inputGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },

  inputGroup: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
    borderRadius: 12,
    padding: Spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  inputLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },

  inputPrefix: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.primary,
    marginRight: Spacing.xs,
  },

  inputSuffix: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.primary,
    marginLeft: Spacing.xs,
  },

  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    textAlign: 'center',
  },

  // Feature Container
  featureContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    paddingTop: Spacing.lg,
    marginTop: Spacing.lg,
  },

  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  featureInfo: {
    flex: 1,
  },

  featureTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 2,
  },

  featureDescription: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
  },

  // Options Container
  optionsContainer: {
    marginTop: Spacing.sm,
  },

  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.secondary + '60',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },

  optionItemActive: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary,
  },

  optionContent: {
    flex: 1,
  },

  optionTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: 2,
  },

  optionTitleActive: {
    color: Colors.primary,
  },

  optionSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
  },

  optionSubtitleActive: {
    color: Colors.primary,
  },

  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  // Bonus Container
  bonusContainer: {
    marginTop: Spacing.sm,
  },

  periodLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Calculation Card
  calculationCard: {
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
  },

  calculationTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },

  calculationText: {
    fontSize: Typography.fontSize.footnote,
    color: Colors.text.secondary,
    marginBottom: 2,
  },

  // Button Container
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },

  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },

  resetButton: {
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.error,
    ...Shadows.small,
  },

  resetButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.error,
  },

  saveButton: {
    backgroundColor: Colors.primary,
    ...Shadows.small,
  },

  saveButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: Colors.background.primary,
  },
});