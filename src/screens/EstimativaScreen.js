/**
 * EstimativaScreen — "e se?" da fidelização.
 *
 * The hospital's published config is the source of truth for real values. This
 * screen lets the doctor SIMULATE a different loyalty % over the current month
 * and see roughly how much it would pay — purely local, never persisted. It
 * reuses the exact same engine (computeMonthSummary) and the published-config
 * overlay, so the "Total atual" matches the rest of the app and only the
 * loyalty piece changes in the simulation.
 */
import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons as Ico } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import { useShifts } from '../contexts/ShiftsContext';
import LocalCache from '../services/LocalCache';
import { getFullShiftConfig } from '../utils/ShiftValueCalculator';
import { computeMonthSummary } from '../utils/MonthSummaryComputerV2';
import { applyPublishedHospitalConfigs, collectInstIds } from '../utils/PublishedHospitalConfig';
import { formatMoney } from '../utils/MoneyFormatter';

const PRESETS = [0, 10, 15, 20, 25, 30];
const pad2 = (n) => String(n).padStart(2, '0');
const received = (s) =>
  (s?.totalGrossValue || 0) + (s?.totalLoyaltyValue || 0) + (s?.totalBonusValue || 0);

/** Overlays a flat loyalty % over the effective config — every hospital + global. */
const withFlatLoyalty = (cfg, pct, instIds) => {
  const institutionLoyalty = { ...(cfg.institutionLoyalty || {}) };
  (instIds || []).forEach((id) => {
    institutionLoyalty[id] = { autoFromHours: false, manualPercentage: pct, loyaltyOptions: [] };
  });
  return {
    ...cfg,
    loyaltyEnabled: true,
    loyaltyOptions: [{ minHours: 0, percentage: pct, active: true }],
    institutionLoyalty,
  };
};

export default function EstimativaScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const userId = user?.id || 0;
  const { daysWithShifts, currentMonth, currentYear } = useShifts();

  const monthKey = `${currentYear}-${pad2(currentMonth)}`;
  const [simPct, setSimPct] = useState(20);
  const [real, setReal] = useState(null);
  const [sim, setSim] = useState(null);
  const [loading, setLoading] = useState(true);

  const effRef = useRef(null);
  const teRef = useRef({});
  const instRef = useRef([]);

  const computeSim = useCallback(
    (pct) => {
      const eff = effRef.current;
      if (!eff) return null;
      const simCfg = withFlatLoyalty(eff, pct, instRef.current);
      return computeMonthSummary(userId, monthKey, daysWithShifts || [], teRef.current, simCfg);
    },
    [userId, monthKey, daysWithShifts],
  );

  const buildBase = useCallback(async () => {
    setLoading(true);
    try {
      const [liveCfg, te] = await Promise.all([
        getFullShiftConfig(),
        LocalCache.getTimeEntries(userId, monthKey),
      ]);
      const instIds = collectInstIds(daysWithShifts);
      const eff = await applyPublishedHospitalConfigs(liveCfg, instIds);
      effRef.current = eff;
      teRef.current = te || {};
      instRef.current = instIds;
      setReal(computeMonthSummary(userId, monthKey, daysWithShifts || [], te || {}, eff));
      setSim(computeSim(simPct));
    } catch (_) {
      setReal(null);
      setSim(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, monthKey, daysWithShifts]);

  useEffect(() => {
    if (userId) buildBase();
  }, [buildBase, userId]);

  // Re-simulate locally (sync, no I/O) whenever the slider changes.
  useEffect(() => {
    if (effRef.current) setSim(computeSim(simPct));
  }, [simPct, computeSim]);

  const realTotal = received(real);
  const simTotal = received(sim);
  const delta = simTotal - realTotal;
  const deltaColor = delta > 0 ? C.success || C.primary : delta < 0 ? C.danger || C.warning : C.text.tertiary;

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: 120 + insets.bottom }}>
        {/* Total atual (verdade) */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Total atual · {monthKey}</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          {loading ? (
            <ActivityIndicator size="small" color={C.primary} style={{ padding: 24 }} />
          ) : (
            <View style={{ padding: 16 }}>
              <Text style={[s.bigValue, { color: C.text.primary }]}>{formatMoney(realTotal)}</Text>
              <View style={s.breakRow}>
                <Text style={[s.breakItem, { color: C.text.tertiary }]}>Bruto {formatMoney(real?.totalGrossValue || 0)}</Text>
                <Text style={[s.breakItem, { color: C.text.tertiary }]}>Fidelização {formatMoney(real?.totalLoyaltyValue || 0)}</Text>
                {(real?.totalBonusValue || 0) > 0 && (
                  <Text style={[s.breakItem, { color: C.text.tertiary }]}>Bônus {formatMoney(real?.totalBonusValue || 0)}</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Controle da simulação */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Simular fidelização</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.toggleLabel, { color: C.text.primary }]}>Percentual simulado</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => setSimPct((p) => Math.max(0, p - 1))} hitSlop={10}
                  style={[s.step, { borderColor: C.border.light, backgroundColor: C.background.secondary }]}>
                  <Ico name="remove" size={16} color={C.text.primary} />
                </Pressable>
                <Text style={[s.pctValue, { color: C.primary }]}>{simPct}%</Text>
                <Pressable onPress={() => setSimPct((p) => Math.min(100, p + 1))} hitSlop={10}
                  style={[s.step, { borderColor: C.border.light, backgroundColor: C.background.secondary }]}>
                  <Ico name="add" size={16} color={C.text.primary} />
                </Pressable>
              </View>
            </View>
            <View style={s.presetRow}>
              {PRESETS.map((p) => {
                const on = p === simPct;
                return (
                  <Pressable key={p} onPress={() => setSimPct(p)}
                    style={[s.preset, {
                      backgroundColor: on ? C.primary : C.background.secondary,
                      borderColor: on ? C.primary : C.border.light,
                    }]}>
                    <Text style={[s.presetText, { color: on ? '#fff' : C.text.secondary }]}>{p}%</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Total simulado */}
        <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>Total estimado</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={{ padding: 16 }}>
            <Text style={[s.bigValue, { color: C.text.primary }]}>{formatMoney(simTotal)}</Text>
            <Text style={[s.delta, { color: deltaColor }]}>
              {delta >= 0 ? '+' : '−'}{formatMoney(Math.abs(delta))} vs. atual
            </Text>
          </View>
        </View>

        <View style={[s.hintBox, { backgroundColor: C.accentSoft, borderColor: C.primary + '30' }]}>
          <Ico name="information-circle-outline" size={16} color={C.primary} />
          <Text style={[s.hintText, { color: C.text.secondary }]}>
            Estimativa local — não altera seus valores salvos nem a configuração do hospital.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, ...Shadows.small },
  sectionLabel: {
    fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: Spacing.sm, marginTop: Spacing.lg,
  },
  bigValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  breakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  breakItem: { fontSize: 11.5 },
  toggleLabel: { fontSize: 14, fontWeight: '700' },
  pctValue: { fontSize: 20, fontWeight: '800', minWidth: 56, textAlign: 'center' },
  step: { width: 34, height: 34, borderRadius: 9, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  presetRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  preset: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, alignItems: 'center' },
  presetText: { fontSize: 12.5, fontWeight: '700' },
  delta: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  hintBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    padding: 12, borderRadius: BorderRadius.md, borderWidth: 0.5, marginTop: Spacing.lg,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
