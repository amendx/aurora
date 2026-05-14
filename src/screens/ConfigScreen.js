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

export default function ConfigScreen({ navigation }) {
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

  const renderInputField = (label, value, onChangeText, suffix = '', placeholder = '0') => {
    const filled = value !== '' && value !== undefined && value !== null;
    return (
      <View style={s.inputBlock}>
        <Text style={s.inputLabel}>{label}</Text>
        <View style={[s.inputRow, filled && s.inputRowFilled]}>
          {suffix === '' && <Text style={s.inputPrefix}>R$</Text>}
          <TextInput
            style={s.textInput}
            value={String(value || '')}
            onChangeText={onChangeText}
            keyboardType="numeric"
            placeholder={placeholder}
            placeholderTextColor={C.text.placeholder}
            selectTextOnFocus
          />
          {suffix !== '' && <Text style={s.inputSuffix}>{suffix}</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Valores durante a semana ── */}
        <Text style={s.sectionLabel}>Semana</Text>
        <View style={s.card}>
          <View style={s.cardAccent} />
          <View style={s.cardBody}>
            <View style={s.cardTitleRow}>
              <View style={[s.cardIconWrap, { backgroundColor: C.primary + '18' }]}>
                <MaterialCommunityIcons name="calendar-outline" size={18} color={C.primary} />
              </View>
              <View>
                <Text style={s.cardTitle}>Dias úteis</Text>
                <Text style={s.cardSubtitle}>Segunda a quinta</Text>
              </View>
            </View>
            <View style={s.inputGrid}>
              {renderInputField('Manhã / Tarde', hourValues.weekday.day, (v) => handleHourChange('weekday', 'day', v))}
              {renderInputField('Noite', hourValues.weekday.night, (v) => handleHourChange('weekday', 'night', v))}
            </View>
          </View>
        </View>

        {/* ── Valores fim de semana ── */}
        <Text style={s.sectionLabel}>Fim de semana</Text>
        <View style={s.card}>
          <View style={[s.cardAccent, { backgroundColor: C.primaryDark }]} />
          <View style={s.cardBody}>
            <View style={s.cardTitleRow}>
              <View style={[s.cardIconWrap, { backgroundColor: C.primaryDark + '18' }]}>
                <MaterialCommunityIcons name="calendar" size={18} color={C.primaryDark} />
              </View>
              <View>
                <Text style={s.cardTitle}>Sábado e domingo</Text>
                <Text style={s.cardSubtitle}>Inclui feriados</Text>
              </View>
            </View>
            <View style={s.inputGrid}>
              {renderInputField('Manhã / Tarde', hourValues.weekend.day, (v) => handleHourChange('weekend', 'day', v))}
              {renderInputField('Noite', hourValues.weekend.night, (v) => handleHourChange('weekend', 'night', v))}
            </View>
          </View>
        </View>

        {/* ── Ajustes de cálculo ── */}
        <Text style={s.sectionLabel}>Ajustes de cálculo</Text>
        <View style={s.card}>
          <View style={[s.cardAccent, { backgroundColor: C.warning }]} />
          <View style={s.cardBody}>

            {/* Fidelização */}
            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>Fidelização</Text>
                <Text style={s.toggleDesc}>Bônus por horas trabalhadas no mês</Text>
              </View>
              <Switch
                value={loyaltyEnabled}
                onValueChange={setLoyaltyEnabled}
                trackColor={{ false: C.interactive.disabled, true: C.primary + '50' }}
                thumbColor={loyaltyEnabled ? C.primary : C.interactive.inactive}
              />
            </View>
            {loyaltyEnabled && (
              <View style={s.optionsContainer}>
                {loyaltyOptions.map((option, index) => {
                  const OPTION_COLORS = [C.primary, C.info, C.primaryDark, C.warning];
                  const color = OPTION_COLORS[index] || C.primary;
                  return (
                  <Pressable
                    key={index}
                    style={[
                      s.optionItem,
                      { borderColor: option.active ? color : color + '35', backgroundColor: option.active ? color + '10' : C.background.primary },
                    ]}
                    onPress={() => handleLoyaltyOptionToggle(index)}
                  >
                    <View style={s.optionContent}>
                      <Text style={[s.optionTitle, { color: option.active ? color : C.text.primary }]}>
                        +{option.percentage}%
                      </Text>
                      <Text style={[s.optionSubtitle, { color: option.active ? color + 'aa' : C.text.secondary }]}>
                        ≥ {option.minHours}h no mês
                      </Text>
                    </View>
                    <View style={[s.radio, { borderColor: option.active ? color : color + '60' }, option.active && { backgroundColor: color }]}>
                      {option.active && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                  </Pressable>
                  );
                })}
              </View>
            )}

            <View style={s.divider} />

            {/* Bônus Geral */}
            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>Bônus geral</Text>
                <Text style={s.toggleDesc}>Percentual adicional por período</Text>
              </View>
              <Switch
                value={bonusEnabled}
                onValueChange={setBonusEnabled}
                trackColor={{ false: C.interactive.disabled, true: C.primaryDark + '50' }}
                thumbColor={bonusEnabled ? C.primaryDark : C.interactive.inactive}
              />
            </View>
            {bonusEnabled && (
              <View style={s.bonusContainer}>
                <View style={s.bonusGrid}>
                  {renderInputField('Percentual', bonus.percentage, (v) => handleBonusChange('percentage', v), '%', '0')}
                </View>
                <Text style={s.periodLabel}>Período de vigência</Text>
                <View style={s.bonusGrid}>
                  {renderInputField('Mês inicial', bonus.startMonth, (v) => handleBonusChange('startMonth', v), '', '1')}
                  {renderInputField('Mês final', bonus.endMonth, (v) => handleBonusChange('endMonth', v), '', '12')}
                </View>
                <View style={s.infoCard}>
                  <Ionicons name="calculator-outline" size={15} color={C.info} style={{ marginRight: Spacing.xs }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.infoText, { color: C.text.primary, fontWeight: Typography.fontWeight.semiBold, marginBottom: 2 }]}>
                      Exemplo de cálculo
                    </Text>
                    <Text style={s.infoText}>
                      Base: R$ {parseFloat(hourValues.weekday.day || 0).toFixed(2)}/h → com bônus: R$ {(parseFloat(hourValues.weekday.day || 0) * (1 + parseFloat(bonus.percentage || 0) / 100)).toFixed(2)}/h
                    </Text>
                    <Text style={s.infoText}>
                      Vigência: {getMonthName(parseInt(bonus.startMonth) || 1)} a {getMonthName(parseInt(bonus.endMonth) || 1)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={s.divider} />

            {/* Sexta noturna */}
            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>Sexta-feira noturna como FDS</Text>
                <Text style={s.toggleDesc}>Plantões noturnos de sexta usam valor de fim de semana</Text>
              </View>
              <Switch
                value={fridayNightAsWeekend}
                onValueChange={setFridayNightAsWeekend}
                trackColor={{ false: C.interactive.disabled, true: C.warning + '50' }}
                thumbColor={fridayNightAsWeekend ? C.warning : C.interactive.inactive}
              />
            </View>
            {fridayNightAsWeekend && (
              <View style={s.infoCard}>
                <Ionicons name="moon-outline" size={15} color={C.info} style={{ marginRight: Spacing.xs }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.infoText}>
                    Noite sexta: R$ {parseFloat(hourValues.weekend.night || 0).toFixed(2)}/h · 12h = R$ {(parseFloat(hourValues.weekend.night || 0) * 12).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <View style={s.divider} />

            {/* Hora extra fracionada */}
            <View style={[s.toggleRow, { marginBottom: 0 }]}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleTitle}>Hora extra fracionada</Text>
                <Text style={s.toggleDesc}>Desativado: só horas inteiras de extra são contadas</Text>
              </View>
              <Switch
                value={fractionalExtraHours}
                onValueChange={setFractionalExtraHours}
                trackColor={{ false: C.interactive.disabled, true: C.primary + '50' }}
                thumbColor={fractionalExtraHours ? C.primary : C.interactive.inactive}
              />
            </View>
            {!fractionalExtraHours && (
              <View style={s.infoCard}>
                <Ionicons name="time-outline" size={15} color={C.info} style={{ marginRight: Spacing.xs }} />
                <Text style={s.infoText}>Exemplo: 6h33 → conta como 6h (minutos ignorados)</Text>
              </View>
            )}

          </View>
        </View>

        {/* ── Botões ── */}
        <View style={s.buttonRow}>
          <Pressable style={[s.btn, s.btnGhost]} onPress={resetToDefaults}>
            <Ionicons name="refresh-outline" size={16} color={C.error} />
            <Text style={[s.btnText, { color: C.error }]}>Restaurar</Text>
          </Pressable>
          <Pressable style={[s.btn, s.btnPrimary]} onPress={saveConfigurations}>
            <Ionicons name="checkmark-outline" size={16} color="#fff" />
            <Text style={[s.btnText, { color: '#fff' }]}>Salvar</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

const makeStyles = (C) => ({
  container:     { flex: 1, backgroundColor: C.background.secondary },
  scrollView:    { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xxl },

  // ── Section label ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },

  // ── Card shell ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
    flexDirection: 'row',
    overflow: 'hidden',
    ...Shadows.small,
  },
  cardAccent: {
    width: 4,
    backgroundColor: C.primary,
  },
  cardBody: {
    flex: 1,
    padding: Spacing.lg,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: 1,
  },
  cardSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.tertiary,
  },

  // ── Input grid ───────────────────────────────────────────────────────────
  inputGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  inputBlock: {
    flex: 1,
  },
  inputLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: C.border.light,
    paddingHorizontal: Spacing.sm,
    height: 44,
  },
  inputRowFilled: {
    borderColor: C.primary,
  },
  inputPrefix: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.primary,
    marginRight: 4,
  },
  inputSuffix: {
    fontSize: Typography.fontSize.footnote,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.primary,
    marginLeft: 4,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.callout,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    textAlign: 'center',
  },

  // ── Toggle rows ──────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  toggleInfo: { flex: 1, paddingRight: Spacing.md },
  toggleTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
  },

  divider: {
    height: 1,
    backgroundColor: C.border.light,
    marginVertical: Spacing.md,
  },

  // ── Loyalty options ──────────────────────────────────────────────────────
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: C.background.secondary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: C.border.light,
  },
  optionItemActive: {
    backgroundColor: C.primary + '12',
    borderColor: C.primary,
  },
  optionContent: {},
  optionTitle: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.bold,
    color: C.text.primary,
  },
  optionSubtitle: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.secondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.pill,
    borderWidth: 2,
    borderColor: C.border.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Bonus container ──────────────────────────────────────────────────────
  bonusContainer: { marginBottom: Spacing.md },
  bonusGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  periodLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },

  // ── Info callout ─────────────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.info + '12',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
    lineHeight: Typography.fontSize.footnote * 1.5,
  },

  // ── Bottom buttons ───────────────────────────────────────────────────────
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 50,
    borderRadius: BorderRadius.pill,
  },
  btnPrimary: {
    backgroundColor: C.primary,
    ...Shadows.small,
  },
  btnGhost: {
    backgroundColor: C.background.primary,
    borderWidth: 1,
    borderColor: C.error,
  },
  btnText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: Typography.fontWeight.semiBold,
  },

  // ── Legacy keys kept so nothing breaks if referenced elsewhere ───────────
  sectionCard:     { display: 'none' },
  cardHeader:      { display: 'none' },
  cardIconContainer: { display: 'none' },
  featureContainer:  { display: 'none' },
  featureHeader:     { display: 'none' },
  featureInfo:       { display: 'none' },
  featureTitle:      { display: 'none' },
  featureDescription:{ display: 'none' },
  buttonContainer:   { display: 'none' },
  button:            { display: 'none' },
  resetButton:       { display: 'none' },
  saveButton:        { display: 'none' },
  resetButtonText:   { display: 'none' },
  saveButtonText:    { display: 'none' },
});
