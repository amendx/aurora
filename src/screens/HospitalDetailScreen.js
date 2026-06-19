import { useState, useEffect, useContext } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Switch,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Ionicons as Ico } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import LocalCache from '../services/LocalCache';
import WebClientApiService from '../services/WebClientApiService';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import { formatMoney } from '../utils/MoneyFormatter';
import { isAuroraOnly } from '../utils/userSource';
import Logger from '../utils/Logger';

const DEFAULT_LOYALTY_TIERS = [
  { minHours: 72,  percentage: 10 },
  { minHours: 120, percentage: 20 },
  { minHours: 168, percentage: 25 },
  { minHours: 264, percentage: 30 },
];

const DEFAULT_HOUR_VALUES = {
  weekday: { day: 130, night: 143 },
  weekend: { day: 170, night: 185 },
};

const DEFAULT_BONUS = { percentage: 0, startMonth: 1, endMonth: 12 };

export default function HospitalDetailScreen({ navigation, institution: instProp, params }) {
  const inst = instProp || params?.institution;
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useContext(AuthContext);
  const userId = user?.id || 0;

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  // Config publicado pelo gestor (institutions/{id}.config) — fonte de verdade.
  const [published, setPublished] = useState(null);
  // Quando o hospital define valores, o médico NÃO edita por padrão; só se ativar.
  const [estimateEnabled, setEstimateEnabled] = useState(false);

  // Loyalty (lives under institutionLoyalty[instId] — pre-existing slot)
  const [autoFromHours, setAutoFromHours] = useState(true);
  const [loyaltyOptions, setLoyaltyOptions] = useState(DEFAULT_LOYALTY_TIERS);
  const [manualPercentage, setManualPercentage] = useState(0);

  // Per-hospital overrides (live under institutionConfig[instId] — new slot)
  const [overrideHourValues, setOverrideHourValues] = useState(false);
  const [hourValues, setHourValues] = useState(DEFAULT_HOUR_VALUES);

  const [overrideBonus, setOverrideBonus] = useState(false);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonus, setBonus] = useState(DEFAULT_BONUS);

  const [overrideFridayNight, setOverrideFridayNight] = useState(false);
  const [fridayNightAsWeekend, setFridayNightAsWeekend] = useState(false);

  const [saving, setSaving] = useState(false);

  const instId = String(inst?.id || '');

  useEffect(() => {
    if (!inst?.id) { setLoading(false); return; }
    loadDetail();
    loadSavedCfg();
    loadPublished();
  }, []);

  // Busca o config oficial publicado pelo gestor na web. Fonte de verdade: quando
  // existe, os valores do hospital têm prioridade e os ajustes do médico viram
  // estimativa. institutions/{id} é leitura pública (rules).
  const loadPublished = async () => {
    if (!instId) return;
    try {
      const map = await FirebaseAdapter.getHospitalConfigs([instId]);
      setPublished(map?.[instId] || null);
    } catch (e) {
      Logger.warn('HospitalDetailScreen: erro ao carregar config publicado', e?.message);
    }
  };

  const loadDetail = async () => {
    setLoading(true);
    try {
      // Aurora-only: PlantaoAPI não tem o doc dessa institution; pula. O detalhe
      // já vem do que o app conhece (inst props) ou de institutions/{id} no Firestore
      // — caller resolve o que mostrar quando detail = null.
      if (isAuroraOnly(user)) { setLoading(false); return; }
      const res = await WebClientApiService.getInstitution(token, inst.id);
      if (res.success && res.data) setDetail(res.data);
    } catch (e) {
      Logger.warn('HospitalDetailScreen: erro ao carregar detalhes', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedCfg = async () => {
    try {
      const raw = await SecureStore.getItemAsync('shift_configurations');
      if (!raw) return;
      const parsed = JSON.parse(raw);

      // Loyalty (existing slot)
      const loyCfg = parsed.institutionLoyalty?.[instId];
      if (loyCfg) {
        setAutoFromHours(loyCfg.autoFromHours ?? true);
        if (loyCfg.loyaltyOptions?.length) setLoyaltyOptions(loyCfg.loyaltyOptions);
        setManualPercentage(loyCfg.manualPercentage || 0);
      }

      // Per-hospital overrides (new slot)
      const inst = parsed.institutionConfig?.[instId];
      if (inst?.hourValues) {
        setOverrideHourValues(true);
        setHourValues({
          weekday: {
            day:   parseFloat(inst.hourValues.weekday?.day)   || DEFAULT_HOUR_VALUES.weekday.day,
            night: parseFloat(inst.hourValues.weekday?.night) || DEFAULT_HOUR_VALUES.weekday.night,
          },
          weekend: {
            day:   parseFloat(inst.hourValues.weekend?.day)   || DEFAULT_HOUR_VALUES.weekend.day,
            night: parseFloat(inst.hourValues.weekend?.night) || DEFAULT_HOUR_VALUES.weekend.night,
          },
        });
      } else {
        // Seed editor with global values so toggling "override" gives a sane starting point
        if (parsed.hourValues) setHourValues(parsed.hourValues);
      }
      if (inst && (inst.bonus || inst.bonusEnabled != null)) {
        setOverrideBonus(true);
        setBonusEnabled(!!inst.bonusEnabled);
        if (inst.bonus) setBonus({ ...DEFAULT_BONUS, ...inst.bonus });
      } else {
        if (parsed.bonus) setBonus({ ...DEFAULT_BONUS, ...parsed.bonus });
        if (parsed.bonusEnabled != null) setBonusEnabled(!!parsed.bonusEnabled);
      }
      if (inst && inst.fridayNightAsWeekend != null) {
        setOverrideFridayNight(true);
        setFridayNightAsWeekend(!!inst.fridayNightAsWeekend);
      } else if (parsed.fridayNightAsWeekend != null) {
        setFridayNightAsWeekend(!!parsed.fridayNightAsWeekend);
      }
    } catch (e) {
      Logger.warn('HospitalDetailScreen: erro ao carregar cfg', e?.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const raw = await SecureStore.getItemAsync('shift_configurations');
      const existing = raw ? JSON.parse(raw) : {};

      // Loyalty (unchanged)
      const institutionLoyalty = existing.institutionLoyalty || {};
      institutionLoyalty[instId] = { autoFromHours, loyaltyOptions, manualPercentage };

      // Per-hospital overrides — only write fields the user enabled.
      const institutionConfig = { ...(existing.institutionConfig || {}) };
      const instEntry = { ...(institutionConfig[instId] || {}) };
      if (overrideHourValues) {
        instEntry.hourValues = hourValues;
      } else {
        delete instEntry.hourValues;
      }
      if (overrideBonus) {
        instEntry.bonusEnabled = bonusEnabled;
        instEntry.bonus = bonus;
      } else {
        delete instEntry.bonusEnabled;
        delete instEntry.bonus;
      }
      if (overrideFridayNight) {
        instEntry.fridayNightAsWeekend = fridayNightAsWeekend;
      } else {
        delete instEntry.fridayNightAsWeekend;
      }
      if (Object.keys(instEntry).length > 0) institutionConfig[instId] = instEntry;
      else delete institutionConfig[instId];

      const updated = {
        ...existing,
        institutionLoyalty,
        institutionConfig,
        loyaltyEnabled: Object.values(institutionLoyalty).some(
          c => c.autoFromHours ? true : (c.manualPercentage || 0) > 0
        ),
      };
      await SecureStore.setItemAsync('shift_configurations', JSON.stringify(updated));
      if (userId) {
        const cached = await LocalCache.getFinancialConfig(userId);
        await LocalCache.saveFinancialConfig(userId, {
          ...updated, userId,
          version: (cached?.version || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      }
      navigation?.goBack?.();
    } catch (e) {
      Logger.error('HospitalDetailScreen: erro ao salvar', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const updateHourValue = (group, period, raw) => {
    const num = parseFloat(String(raw).replace(',', '.')) || 0;
    setHourValues(prev => ({
      ...prev,
      [group]: { ...prev[group], [period]: num },
    }));
  };

  const updateBonusField = (k, v) => setBonus(prev => ({ ...prev, [k]: v }));

  const d = detail || inst || {};
  // Sem config do hospital → médico define os próprios valores (real). Com config
  // → seções editáveis ficam ocultas até ele ativar "Personalizar (estimativa)".
  const showEditable = !published || estimateEnabled;

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: 100 }}>

        {/* Institution info card */}
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          {loading ? (
            <ActivityIndicator size="small" color={C.primary} style={{ padding: 20 }} />
          ) : (
            <>
              <View style={s.infoRow}>
                <Ico name="business-outline" size={15} color={C.primary} />
                <Text style={[s.infoText, { color: C.text.primary }]}>{d.name || '—'}</Text>
              </View>
              {d.popular_name && d.popular_name !== d.name ? (
                <View style={[s.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border.light }]}>
                  <Ico name="ribbon-outline" size={15} color={C.text.tertiary} />
                  <Text style={[s.infoText, { color: C.text.secondary }]}>{d.popular_name}</Text>
                </View>
              ) : null}
              {d.city ? (
                <View style={[s.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border.light }]}>
                  <Ico name="location-outline" size={15} color={C.text.tertiary} />
                  <Text style={[s.infoText, { color: C.text.secondary }]}>{[d.city, d.uf].filter(Boolean).join(' · ')}</Text>
                </View>
              ) : null}
              {d.cnes ? (
                <View style={[s.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border.light }]}>
                  <Ico name="card-outline" size={15} color={C.text.tertiary} />
                  <Text style={[s.infoText, { color: C.text.tertiary }]}>CNES {d.cnes}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* ── Valores oficiais publicados pelo gestor (fonte de verdade) ── */}
        {published && (
          <>
            <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Definido pelo hospital</Text>
            <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.primary + '55' }]}>
              <View style={[s.pubHeader, { backgroundColor: C.accentSoft }]}>
                <Ico name="shield-checkmark-outline" size={15} color={C.primary} />
                <Text style={[s.pubHeaderText, { color: C.primary }]}>Valores oficiais — definidos pelo gestor</Text>
              </View>
              <View style={{ padding: 14 }}>
                {/* Valores por hora */}
                <Text style={[s.pubGroupLabel, { color: C.text.primary }]}>Valores por hora</Text>

                <Text style={[s.pubMiniLabel, { color: C.text.tertiary }]}>Durante a semana</Text>
                <View style={s.rateRowWrap}>
                  <RateChip C={C} icon="sunny-outline" label="Dia"   value={published.hourValues?.weekday?.day} />
                  <RateChip C={C} icon="moon-outline"  label="Noite" value={published.hourValues?.weekday?.night} />
                </View>

                <Text style={[s.pubMiniLabel, { color: C.text.tertiary, marginTop: 12 }]}>Fim de semana</Text>
                <View style={s.rateRowWrap}>
                  <RateChip C={C} icon="sunny-outline" label="Dia"   value={published.hourValues?.weekend?.day} />
                  <RateChip C={C} icon="moon-outline"  label="Noite" value={published.hourValues?.weekend?.night} />
                </View>

                {/* Regras */}
                <View style={s.badgeRow}>
                  <Badge C={C} icon="partly-sunny-outline"
                    text={published.fridayNightAsWeekend ? 'Sex. noite conta como FDS' : 'Sex. noite = semana'} />
                  {published.bonusEnabled ? (
                    <Badge C={C} icon="sparkles-outline" tone="warn"
                      text={`Bônus +${published.bonus?.percentage || 0}% · ${monthShort(published.bonus?.startMonth)}–${monthShort(published.bonus?.endMonth)}`} />
                  ) : null}
                </View>

                {/* Fidelização */}
                <Text style={[s.pubGroupLabel, { color: C.text.primary, marginTop: 16 }]}>Fidelização por horas</Text>
                {published.loyalty?.autoFromHours ? (
                  (published.loyalty.loyaltyOptions || []).length ? (
                    <View style={s.tierRow}>
                      {published.loyalty.loyaltyOptions.map((t, i) => (
                        <View key={i} style={[s.tierCell, { flex: 1, backgroundColor: C.accentSoft + '70', borderColor: C.primary + '30' }]}>
                          <Text style={[s.tierPct, { color: C.primary }]}>+{t.percentage}%</Text>
                          <Text style={[s.tierHours, { color: C.text.tertiary }]}>{t.minHours}h+</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[s.pubEmpty, { color: C.text.tertiary }]}>Sem faixas definidas</Text>
                  )
                ) : (
                  <View style={[s.tierCell, { alignSelf: 'flex-start', paddingHorizontal: 20, backgroundColor: C.accentSoft + '70', borderColor: C.primary + '30' }]}>
                    <Text style={[s.tierPct, { color: C.primary }]}>+{published.loyalty?.manualPercentage || 0}%</Text>
                    <Text style={[s.tierHours, { color: C.text.tertiary }]}>fixo</Text>
                  </View>
                )}
              </View>
            </View>
            {/* Toggle-mestre: por padrão o médico não edita; só se quiser estimar. */}
            <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
              <View style={s.toggleRow}>
                <View style={[s.toggleIcon, { backgroundColor: C.accentSoft }]}>
                  <Ico name="create-outline" size={16} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.toggleLabel, { color: C.text.primary }]}>Personalizar (estimativa)</Text>
                  <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                    {estimateEnabled
                      ? 'Seus ajustes valem só como estimativa local — não alteram os valores oficiais.'
                      : 'O app usa os valores oficiais do hospital. Ative para simular outros valores.'}
                  </Text>
                </View>
                <Switch
                  value={estimateEnabled}
                  onValueChange={setEstimateEnabled}
                  trackColor={{ false: C.border.medium, true: C.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </>
        )}

        {showEditable && (
        <>
        {/* Loyalty section label */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>
          {published ? 'Fidelização (estimativa)' : 'Fidelização'}
        </Text>

        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          {/* Auto toggle */}
          <View style={s.toggleRow}>
            <View style={[s.toggleIcon, { backgroundColor: C.accentSoft }]}>
              <Ico name="analytics-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: C.text.primary }]}>Automático pelas horas</Text>
              <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                {autoFromHours ? 'Faixa calculada com base nas horas do mês' : 'Percentual fixo definido manualmente'}
              </Text>
            </View>
            <Switch
              value={autoFromHours}
              onValueChange={setAutoFromHours}
              trackColor={{ false: C.border.medium, true: C.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light }} />

          {autoFromHours ? (
            <View style={{ padding: 12 }}>
              <Text style={[s.subLabel, { color: C.text.tertiary }]}>Faixas de horas</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {loyaltyOptions.map((tier, i) => (
                  <View key={i} style={[s.tierCell, { flex: 1, backgroundColor: C.accentSoft + '70', borderColor: C.primary + '30' }]}>
                    <Text style={[s.tierPct, { color: C.primary }]}>+{tier.percentage}%</Text>
                    <Text style={[s.tierHours, { color: C.text.tertiary }]}>{tier.minHours}h</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.hint, { color: C.text.tertiary, marginTop: 8 }]}>
                A faixa ativa é calculada automaticamente ao atualizar os plantões.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
              <Text style={[s.subLabel, { color: C.text.tertiary, marginBottom: 0 }]}>Percentual fixo</Text>
              <View style={[s.pill, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
                <Text style={[s.pillPrefix, { color: C.text.tertiary }]}>+</Text>
                <TextInput
                  style={[s.pillInput, { color: C.text.primary }]}
                  value={String(manualPercentage || '')}
                  onChangeText={v => setManualPercentage(parseFloat(v) || 0)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
                <Text style={[s.pillSuffix, { color: C.text.tertiary }]}>%</Text>
              </View>
            </View>
          )}
        </View>

        {/* Valores por hora */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Valores por hora</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={s.toggleRow}>
            <View style={[s.toggleIcon, { backgroundColor: C.accentSoft }]}>
              <Ico name="cash-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: C.text.primary }]}>Usar valores específicos</Text>
              <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                {overrideHourValues ? 'Valores deste hospital sobrescrevem o global' : 'Usando os valores configurados em Configurações'}
              </Text>
            </View>
            <Switch
              value={overrideHourValues}
              onValueChange={setOverrideHourValues}
              trackColor={{ false: C.border.medium, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
          {overrideHourValues && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light }} />
              <View style={{ padding: 12, gap: 10 }}>
                <Text style={[s.subLabel, { color: C.text.tertiary }]}>Semana</Text>
                <RateRow C={C} label="Manhã / Tarde" hint="07:00 – 19:00"
                  value={hourValues.weekday.day}
                  onChangeText={v => updateHourValue('weekday', 'day', v)} />
                <RateRow C={C} label="Noite" hint="19:00 – 07:00"
                  value={hourValues.weekday.night}
                  onChangeText={v => updateHourValue('weekday', 'night', v)} />
                <Text style={[s.subLabel, { color: C.text.tertiary, marginTop: 6 }]}>Fim de semana</Text>
                <RateRow C={C} label="Manhã / Tarde" hint="07:00 – 19:00"
                  value={hourValues.weekend.day}
                  onChangeText={v => updateHourValue('weekend', 'day', v)} />
                <RateRow C={C} label="Noite" hint="19:00 – 07:00"
                  value={hourValues.weekend.night}
                  onChangeText={v => updateHourValue('weekend', 'night', v)} />
              </View>
            </>
          )}
        </View>

        {/* Bônus */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Bônus</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={s.toggleRow}>
            <View style={[s.toggleIcon, { backgroundColor: C.accentSoft }]}>
              <Ico name="sparkles-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: C.text.primary }]}>Usar bônus específico</Text>
              <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                {overrideBonus ? 'Bônus deste hospital sobrescreve o global' : 'Usando o bônus geral configurado em Configurações'}
              </Text>
            </View>
            <Switch
              value={overrideBonus}
              onValueChange={setOverrideBonus}
              trackColor={{ false: C.border.medium, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
          {overrideBonus && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light }} />
              <View style={s.toggleRow}>
                <View style={[s.toggleIcon, { backgroundColor: C.accentSoft }]}>
                  <Ico name="add-circle-outline" size={16} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.toggleLabel, { color: C.text.primary }]}>Aplicar bônus</Text>
                  <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                    {bonusEnabled ? (
                      <>
                        +{bonus.percentage || 0}% nos meses {monthShort(bonus.startMonth)}–{monthShort(bonus.endMonth)}
                      </>
                    ) : 'Bônus temporário desativado'}
                  </Text>
                </View>
                <Switch
                  value={bonusEnabled}
                  onValueChange={setBonusEnabled}
                  trackColor={{ false: C.border.medium, true: C.primary }}
                  thumbColor="#fff"
                />
              </View>
              {bonusEnabled && (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light, marginLeft: 14 }} />
                  <View style={{ padding: 12, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[s.subLabel, { color: C.text.tertiary, marginBottom: 0 }]}>Percentual</Text>
                      <View style={[s.pill, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
                        <Text style={[s.pillPrefix, { color: C.text.tertiary }]}>+</Text>
                        <TextInput
                          style={[s.pillInput, { color: C.text.primary }]}
                          value={String(bonus.percentage || '')}
                          onChangeText={v => updateBonusField('percentage', parseFloat(String(v).replace(',', '.')) || 0)}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />
                        <Text style={[s.pillSuffix, { color: C.text.tertiary }]}>%</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[s.subLabel, { color: C.text.tertiary, marginBottom: 0 }]}>Mês início</Text>
                      <MonthPicker C={C} value={bonus.startMonth} onChange={v => updateBonusField('startMonth', v)} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[s.subLabel, { color: C.text.tertiary, marginBottom: 0 }]}>Mês fim</Text>
                      <MonthPicker C={C} value={bonus.endMonth} onChange={v => updateBonusField('endMonth', v)} />
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Sexta-feira à noite */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Regras de fim de semana</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={s.toggleRow}>
            <View style={[s.toggleIcon, { backgroundColor: C.warning + '1a' }]}>
              <Ico name="partly-sunny-outline" size={16} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.toggleLabel, { color: C.text.primary }]}>Usar regra específica</Text>
              <Text style={[s.toggleHint, { color: C.text.tertiary }]}>
                {overrideFridayNight ? 'Regra deste hospital sobrescreve o global' : 'Usando a regra configurada em Configurações'}
              </Text>
            </View>
            <Switch
              value={overrideFridayNight}
              onValueChange={setOverrideFridayNight}
              trackColor={{ false: C.border.medium, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
          {overrideFridayNight && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light }} />
              <View style={s.toggleRow}>
                <View style={[s.toggleIcon, { backgroundColor: C.warning + '1a' }]}>
                  <Ico name="moon-outline" size={16} color={C.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.toggleLabel, { color: C.text.primary }]}>Sex. noite conta como FDS</Text>
                  <Text style={[s.toggleHint, { color: C.text.tertiary }]}>19:00 sex → 07:00 sáb</Text>
                </View>
                <Switch
                  value={fridayNightAsWeekend}
                  onValueChange={setFridayNightAsWeekend}
                  trackColor={{ false: C.border.medium, true: C.primary }}
                  thumbColor="#fff"
                />
              </View>
            </>
          )}
        </View>
        </>
        )}
      </ScrollView>

      {/* Save button — só quando há seções editáveis visíveis */}
      {showEditable && (
        <View style={[s.footer, { paddingBottom: Spacing.md, backgroundColor: C.background.secondary, borderTopColor: C.border.light }]}>
          <Pressable style={[s.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveBtnText}>Salvar</Text>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Small composable rows for the new sections ─────────────────────────────
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const monthShort = (v) => {
  if (v == null) return '—';
  if (typeof v === 'string' && v.includes('-')) v = parseInt(v.slice(-2), 10);
  const n = parseInt(v, 10);
  return n >= 1 && n <= 12 ? MONTH_SHORT[n - 1] : '—';
};

// Hour-rate tile (sol/lua) for the manager-published "Definido pelo hospital" card.
const RateChip = ({ C, icon, label, value }) => (
  <View style={[s.rateChip, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
    <View style={s.rateChipHead}>
      <Ico name={icon} size={13} color={C.text.tertiary} />
      <Text style={[s.rateChipLabel, { color: C.text.tertiary }]}>{label}</Text>
    </View>
    <Text style={[s.rateChipValue, { color: C.text.primary }]}>{formatMoney(value)}</Text>
    <Text style={[s.rateChipUnit, { color: C.text.tertiary }]}>por hora</Text>
  </View>
);

// Small rounded chip for boolean rules (sexta-noite, bônus).
const Badge = ({ C, icon, text, tone }) => {
  const col = tone === 'warn' ? C.warning : C.primary;
  return (
    <View style={[s.badge, { backgroundColor: col + '18', borderColor: col + '33' }]}>
      <Ico name={icon} size={12} color={col} />
      <Text style={[s.badgeText, { color: col }]}>{text}</Text>
    </View>
  );
};

const RateRow = ({ C, label, hint, value, onChangeText }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <View style={{ flex: 1 }}>
      <Text style={[s.toggleLabel, { color: C.text.primary, fontSize: 13 }]}>{label}</Text>
      {hint ? <Text style={[s.toggleHint, { color: C.text.tertiary }]}>{hint}</Text> : null}
    </View>
    <View style={[s.pill, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
      <Text style={[s.pillPrefix, { color: C.text.tertiary }]}>R$</Text>
      <TextInput
        style={[s.pillInput, { color: C.text.primary }]}
        value={String(value || '')}
        onChangeText={onChangeText}
        keyboardType="numeric"
        selectTextOnFocus
      />
      <Text style={[s.pillSuffix, { color: C.text.tertiary }]}>/h</Text>
    </View>
  </View>
);

const MonthPicker = ({ C, value, onChange }) => {
  const num = (() => {
    if (value == null) return 1;
    if (typeof value === 'string' && value.includes('-')) return parseInt(value.slice(-2), 10);
    const n = parseInt(value, 10);
    return n >= 1 && n <= 12 ? n : 1;
  })();
  const dec = () => onChange(((num - 2 + 12) % 12) + 1);
  const inc = () => onChange((num % 12) + 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={dec} hitSlop={10} style={[s.pill, { paddingHorizontal: 8, backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
        <Ico name="chevron-back" size={14} color={C.text.primary} />
      </Pressable>
      <Text style={{ minWidth: 36, textAlign: 'center', color: C.text.primary, fontWeight: '700' }}>{monthShort(num)}</Text>
      <Pressable onPress={inc} hitSlop={10} style={[s.pill, { paddingHorizontal: 8, backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
        <Ico name="chevron-forward" size={14} color={C.text.primary} />
      </Pressable>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },

  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, ...Shadows.small },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  infoText: { flex: 1, fontSize: 14, fontFamily: Typography.fontFamily.regular },

  pubHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  pubHeaderText: { fontSize: 12, fontWeight: '700' },
  pubGroupLabel: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.2, marginBottom: 10 },
  pubMiniLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  rateRowWrap: { flexDirection: 'row', gap: 10 },
  rateChip: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 0.5 },
  rateChipHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  rateChipLabel: { fontSize: 11, fontWeight: '700' },
  rateChipValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  rateChipUnit: { fontSize: 10, marginTop: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 0.5 },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  tierRow: { flexDirection: 'row', gap: 6 },
  pubEmpty: { fontSize: 12.5 },

  sectionLabel: {
    fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.lg,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 52 },
  toggleIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toggleLabel: { fontSize: 14, fontWeight: '700' },
  toggleHint:  { fontSize: 11, marginTop: 1 },

  subLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  hint:     { fontSize: 11.5, lineHeight: 17 },

  tierCell:  { padding: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  tierPct:   { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  tierHours: { fontSize: 10, marginTop: 1 },

  pill: { flexDirection: 'row', alignItems: 'baseline', gap: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5 },
  pillPrefix: { fontSize: 10, fontWeight: '600' },
  pillInput:  { fontSize: 17, fontWeight: '600', minWidth: 44, textAlign: 'center' },
  pillSuffix: { fontSize: 10 },

  footer: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.md, borderTopWidth: 0.5 },
  saveBtn: { height: 50, borderRadius: BorderRadius.pill, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontFamily: Typography.fontFamily.bold, color: '#fff', fontWeight: '700' },
});
