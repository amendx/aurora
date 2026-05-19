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
import Logger from '../utils/Logger';

const DEFAULT_LOYALTY_TIERS = [
  { minHours: 72,  percentage: 10 },
  { minHours: 120, percentage: 20 },
  { minHours: 168, percentage: 25 },
  { minHours: 264, percentage: 30 },
];

export default function HospitalDetailScreen({ navigation, institution: instProp, params }) {
  const inst = instProp || params?.institution;
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useContext(AuthContext);
  const userId = user?.id || 0;

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const [autoFromHours, setAutoFromHours] = useState(true);
  const [loyaltyOptions, setLoyaltyOptions] = useState(DEFAULT_LOYALTY_TIERS);
  const [manualPercentage, setManualPercentage] = useState(0);
  const [saving, setSaving] = useState(false);

  const instId = String(inst?.id || '');

  useEffect(() => {
    if (!inst?.id) { setLoading(false); return; }
    loadDetail();
    loadSavedCfg();
  }, []);

  const loadDetail = async () => {
    setLoading(true);
    try {
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
      if (raw) {
        const parsed = JSON.parse(raw);
        const cfg = parsed.institutionLoyalty?.[instId];
        if (cfg) {
          setAutoFromHours(cfg.autoFromHours ?? true);
          if (cfg.loyaltyOptions?.length) setLoyaltyOptions(cfg.loyaltyOptions);
          setManualPercentage(cfg.manualPercentage || 0);
        }
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
      const institutionLoyalty = existing.institutionLoyalty || {};
      institutionLoyalty[instId] = { autoFromHours, loyaltyOptions, manualPercentage };
      const updated = {
        ...existing,
        institutionLoyalty,
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

  const d = detail || inst || {};

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + 100 }}>

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

        {/* Loyalty section label */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Fidelização</Text>

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
      </ScrollView>

      {/* Save button */}
      <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: C.background.secondary, borderTopColor: C.border.light }]}>
        <Pressable style={[s.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Salvar</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, ...Shadows.small },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  infoText: { flex: 1, fontSize: 14, fontFamily: Typography.fontFamily.regular },

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
