import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import LocalCache from '../services/LocalCache';

export default function ConfigScreenPremium({ navigation }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id || 0;
  const C = useColors();
  const s = makeStyles(C);

  const [hourValues, setHourValues] = useState({
    weekday: { day: 130, night: 143 },
    weekend: { day: 170, night: 185 },
  });

  // Carregar configurações salvas quando o componente for montado
  React.useEffect(() => {
    loadSavedConfigurations();
  }, []);

  const loadSavedConfigurations = async () => {
    try {
      // Prefer LocalCache (post-migration). Fall back to SecureStore for compat.
      let parsedConfig = null;
      if (userId) {
        parsedConfig = await LocalCache.getFinancialConfig(userId);
      }
      if (!parsedConfig) {
        const raw = await SecureStore.getItemAsync('shift_configurations');
        if (raw) parsedConfig = JSON.parse(raw);
      }
      if (parsedConfig) {
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
        if (parsedConfig.fractionalExtraHours !== undefined) {
          setFractionalExtraHours(parsedConfig.fractionalExtraHours);
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
  const [fractionalExtraHours, setFractionalExtraHours] = useState(true);

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
      const now = new Date();
      const effectiveFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const configData = {
        hourValues,
        loyaltyEnabled,
        loyaltyOptions,
        bonusEnabled,
        bonus,
        fridayNightAsWeekend,
        fractionalExtraHours,
        savedAt: now.toISOString(),
      };

      // Keep writing to SecureStore — ShiftValueCalculator still reads from there.
      await SecureStore.setItemAsync('shift_configurations', JSON.stringify(configData));

      // Also write to LocalCache with versioning so MonthSummary can track config changes.
      if (userId) {
        const existing = await LocalCache.getFinancialConfig(userId);
        const nextVersion = (existing?.version || 0) + 1;
        const lcConfig = {
          ...configData,
          userId,
          version:       nextVersion,
          effectiveFrom,
          updatedAt:     now.toISOString(),
        };
        // saveFinancialConfig marks current + next month summaries dirty automatically
        await LocalCache.saveFinancialConfig(userId, lcConfig);
      }

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
              weekday: { day: 130, night: 143 },
              weekend: { day: 170, night: 185 },
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
            setFractionalExtraHours(true);
          },
        },
      ]
    );
  };

  // GroupsScreen structure: groupCard > groupHeader (titleRow + stats) > groupMembers > memberCard rows
  const renderShiftInputField = (label, value, onChangeText, prefix = 'R$') => (
    <View style={s.shiftFieldRow}>
      <View style={s.shiftFieldInfo}>
        <Text style={s.shiftFieldName}>{label}</Text>
        <Text style={s.shiftFieldRole}>Valor por hora</Text>
      </View>
      <View style={s.shiftFieldInput}>
        <Text style={s.shiftInputPrefix}>{prefix}</Text>
        <TextInput
          style={s.shiftTextInput}
          value={String(value || '')}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder="0,00"
          placeholderTextColor={C.text.placeholder}
          selectTextOnFocus={true}
        />
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Valores durante a semana */}
        <View style={s.valueCard}>
          <View style={s.valueCardHeader}>
            <View style={s.valueInfo}>
              <View style={s.valueTitleRow}>
                <View style={[s.valueColorDot, { backgroundColor: C.primary }]} />
                <Text style={s.valueName}>Valores durante a semana</Text>
              </View>
              <View style={s.valueStats}>
                <View style={s.valueStatItem}>
                  <MaterialCommunityIcons name="calendar-outline" size={16} color={C.text.secondary} />
                  <Text style={s.valueStatText}>2 turnos</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={s.valueFields}>
            {renderShiftInputField('Manhã / Tarde', hourValues.weekday.day, (v) => handleHourChange('weekday', 'day', v))}
            {renderShiftInputField('Noite', hourValues.weekday.night, (v) => handleHourChange('weekday', 'night', v))}
          </View>
        </View>

        {/* Valores fim de semana */}
        <View style={s.valueCard}>
          <View style={s.valueCardHeader}>
            <View style={s.valueInfo}>
              <View style={s.valueTitleRow}>
                <View style={[s.valueColorDot, { backgroundColor: C.success }]} />
                <Text style={s.valueName}>Valores fim de semana</Text>
              </View>
              <View style={s.valueStats}>
                <View style={s.valueStatItem}>
                  <MaterialCommunityIcons name="calendar" size={16} color={C.text.secondary} />
                  <Text style={s.valueStatText}>2 turnos</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={s.valueFields}>
            {renderShiftInputField('Manhã / Tarde', hourValues.weekend.day, (v) => handleHourChange('weekend', 'day', v))}
            {renderShiftInputField('Noite', hourValues.weekend.night, (v) => handleHourChange('weekend', 'night', v))}
          </View>
        </View>

        {/* Configurações adicionais */}
        <View style={s.sectionCard}>
          <View style={s.cardHeader}>
            <View style={s.cardIconContainer}>
              <Ionicons name="settings-outline" size={20} color={C.warning} />
            </View>
            <Text style={s.cardTitle}>Configurações adicionais</Text>
          </View>

          {/* Fidelização */}
          <View style={s.featureContainer}>
            <View style={s.featureHeader}>
              <View style={s.featureInfo}>
                <Text style={s.featureTitle}>Fidelização</Text>
                <Text style={s.featureDescription}>
                  Bônus baseado em horas trabalhadas no mês
                </Text>
              </View>
              <Switch
                value={loyaltyEnabled}
                onValueChange={setLoyaltyEnabled}
                trackColor={{
                  false: C.interactive.disabled,
                  true: C.primary + '40'
                }}
                thumbColor={loyaltyEnabled ? C.primary : C.interactive.inactive}
              />
            </View>

            {loyaltyEnabled && (
              <View style={s.optionsContainer}>
                {loyaltyOptions.map((option, index) => (
                  <Pressable
                    key={index}
                    style={[
                      s.optionItem,
                      option.active && s.optionItemActive,
                    ]}
                    onPress={() => handleLoyaltyOptionToggle(index)}
                  >
                    <View style={s.optionContent}>
                      <Text style={[
                        s.optionTitle,
                        option.active && s.optionTitleActive,
                      ]}>
                        {option.percentage}% de Bônus
                      </Text>
                      <Text style={[
                        s.optionSubtitle,
                        option.active && s.optionSubtitleActive,
                      ]}>
                        Para ≥ {option.minHours} horas no mês
                      </Text>
                    </View>
                    <View style={[
                      s.radioButton,
                      option.active && s.radioButtonActive,
                    ]}>
                      {option.active && (
                        <Ionicons name="checkmark" size={12} color={C.background.primary} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Bônus Geral */}
          <View style={s.featureContainer}>
            <View style={s.featureHeader}>
              <View style={s.featureInfo}>
                <Text style={s.featureTitle}>Bônus geral</Text>
                <Text style={s.featureDescription}>
                  Percentual adicional por período específico
                </Text>
              </View>
              <Switch
                value={bonusEnabled}
                onValueChange={setBonusEnabled}
                trackColor={{
                  false: C.interactive.disabled,
                  true: C.success + '40'
                }}
                thumbColor={bonusEnabled ? C.success : C.interactive.inactive}
              />
            </View>

            {bonusEnabled && (
              <View style={s.bonusContainer}>
                <View style={s.inputGrid}>
                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>Percentual</Text>
                    <View style={s.inputContainer}>
                      <TextInput
                        style={s.textInput}
                        value={String(bonus.percentage || '')}
                        onChangeText={(value) => handleBonusChange('percentage', value)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={C.text.placeholder}
                      />
                      <Text style={s.inputSuffix}>%</Text>
                    </View>
                  </View>
                </View>

                <Text style={s.periodLabel}>Período de Vigência</Text>
                <View style={s.inputGrid}>
                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>Mês Inicial</Text>
                    <View style={s.inputContainer}>
                      <TextInput
                        style={s.textInput}
                        value={String(bonus.startMonth || '')}
                        onChangeText={(value) => handleBonusChange('startMonth', value)}
                        keyboardType="numeric"
                        placeholder="1"
                        placeholderTextColor={C.text.placeholder}
                      />
                    </View>
                  </View>

                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>Mês Final</Text>
                    <View style={s.inputContainer}>
                      <TextInput
                        style={s.textInput}
                        value={String(bonus.endMonth || '')}
                        onChangeText={(value) => handleBonusChange('endMonth', value)}
                        keyboardType="numeric"
                        placeholder="12"
                        placeholderTextColor={C.text.placeholder}
                      />
                    </View>
                  </View>
                </View>

                <View style={s.calculationCard}>
                  <Text style={s.calculationTitle}>📊 Exemplo de Cálculo</Text>
                  <Text style={s.calculationText}>
                    Valor base: R$ {parseFloat(hourValues.weekday.day || 0).toFixed(2)} (Dia - Semana)
                  </Text>
                  <Text style={s.calculationText}>
                    Com bônus ({parseFloat(bonus.percentage || 0)}%): R$ {(parseFloat(hourValues.weekday.day || 0) + (parseFloat(hourValues.weekday.day || 0) * parseFloat(bonus.percentage || 0) / 100)).toFixed(2)}
                  </Text>
                  <Text style={s.calculationText}>
                    Vigência: {getMonthName(parseInt(bonus.startMonth) || 1)} a {getMonthName(parseInt(bonus.endMonth) || 1)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Sexta-feira Noturna */}
          <View style={s.featureContainer}>
            <View style={s.featureHeader}>
              <View style={s.featureInfo}>
                <Text style={s.featureTitle}>Sexta-feira Noturna</Text>
                <Text style={s.featureDescription}>
                  Aplicar valor de fim de semana para plantões noturnos de sexta
                </Text>
              </View>
              <Switch
                value={fridayNightAsWeekend}
                onValueChange={setFridayNightAsWeekend}
                trackColor={{
                  false: C.interactive.disabled,
                  true: C.warning + '40'
                }}
                thumbColor={fridayNightAsWeekend ? C.warning : C.interactive.inactive}
              />
            </View>

            {fridayNightAsWeekend && (
              <View style={s.calculationCard}>
                <Text style={s.calculationTitle}>🌙 Regra Especial</Text>
                <Text style={s.calculationText}>
                  Plantões noturnos de sexta-feira usarão valores de fim de semana
                </Text>
                <Text style={s.calculationText}>
                  Valor noturno sexta: R$ {parseFloat(hourValues.weekend.night || 0).toFixed(2)}/h (igual ao FDS)
                </Text>
                <Text style={s.calculationText}>
                  Valor para 12h: R$ {(parseFloat(hourValues.weekend.night || 0) * 12).toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          {/* Hora Extra Fracionada */}
          <View style={s.featureContainer}>
            <View style={s.featureHeader}>
              <View style={s.featureInfo}>
                <Text style={s.featureTitle}>Hora Extra Fracionada</Text>
                <Text style={s.featureDescription}>
                  Quando desativado, apenas horas completas de extra são contabilizadas
                </Text>
              </View>
              <Switch
                value={fractionalExtraHours}
                onValueChange={setFractionalExtraHours}
                trackColor={{
                  false: C.interactive.disabled,
                  true: C.primary + '40',
                }}
                thumbColor={fractionalExtraHours ? C.primary : C.interactive.inactive}
              />
            </View>
            {!fractionalExtraHours && (
              <View style={s.calculationCard}>
                <Text style={s.calculationTitle}>⏱ Regra de Arredondamento</Text>
                <Text style={s.calculationText}>
                  Minutos extras são ignorados — somente horas inteiras contam
                </Text>
                <Text style={s.calculationText}>
                  Exemplo: 6h33 → conta como 6h (sem extra)
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={s.buttonContainer}>
          <Pressable
            style={[s.button, s.resetButton]}
            onPress={resetToDefaults}
          >
            <Ionicons name="refresh-outline" size={18} color={C.error} />
            <Text style={s.resetButtonText}>Restaurar Padrões</Text>
          </Pressable>

          <Pressable
            style={[s.button, s.saveButton]}
            onPress={saveConfigurations}
          >
            <Ionicons name="checkmark-outline" size={18} color={C.background.primary} />
            <Text style={s.saveButtonText}>Salvar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
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
    backgroundColor: C.background.primary,
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
    backgroundColor: C.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },

  cardTitle: {
    fontSize: Typography.fontSize.headline,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
  },

  // ── Shift Value Cards (structure copied from GroupsScreen) ──────────────
  // groupCard
  valueCard: {
    backgroundColor: C.background.primary,
    borderRadius: 16,
    marginBottom: 16,
    ...Shadows.medium,
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
    color: C.text.primary,
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
    color: C.text.secondary,
  },
  // groupMembers
  valueFields: {
    borderTopWidth: 1,
    borderTopColor: C.border.light,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  // memberCard
  shiftFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.secondary,
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
    color: C.text.primary,
  },
  // memberRole
  shiftFieldRole: {
    fontSize: 12,
    color: C.text.secondary,
    marginTop: 2,
  },
  // memberActions area — input on the right
  shiftFieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...Shadows.small,
  },
  shiftInputPrefix: {
    fontSize: 12,
    fontWeight: '600',
    color: C.primary,
    marginRight: 4,
  },
  shiftTextInput: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text.primary,
    textAlign: 'center',
    minWidth: 64,
  },
  // ────────────────────────────────────────────────────────────────────────

  // Input Grid (2 campos por linha)
  inputGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },

  inputGroup: {
    flex: 1,
    backgroundColor: C.background.secondary,
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
    color: C.text.secondary,
    marginBottom: Spacing.sm,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.primary,
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
    color: C.primary,
    marginRight: Spacing.xs,
  },

  inputSuffix: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.primary,
    marginLeft: Spacing.xs,
  },

  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    textAlign: 'center',
  },

  // Feature Container
  featureContainer: {
    borderTopWidth: 1,
    borderTopColor: C.border.light,
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
    color: C.text.primary,
    marginBottom: 2,
  },

  featureDescription: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
  },

  // Options Container
  optionsContainer: {
    marginTop: Spacing.sm,
  },

  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background.secondary + '60',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: C.border.light,
  },

  optionItemActive: {
    backgroundColor: C.primary + '10',
    borderColor: C.primary,
  },

  optionContent: {
    flex: 1,
  },

  optionTitle: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: 2,
  },

  optionTitleActive: {
    color: C.primary,
  },

  optionSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
  },

  optionSubtitleActive: {
    color: C.primary,
  },

  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioButtonActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },

  // Bonus Container
  bonusContainer: {
    marginTop: Spacing.sm,
  },

  periodLabel: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Calculation Card
  calculationCard: {
    backgroundColor: C.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: C.info,
  },

  calculationTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: Spacing.xs,
  },

  calculationText: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
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
    backgroundColor: C.background.primary,
    borderWidth: 1,
    borderColor: C.error,
    ...Shadows.small,
  },

  resetButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.error,
  },

  saveButton: {
    backgroundColor: C.primary,
    ...Shadows.small,
  },

  saveButtonText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.background.primary,
  },
});
