import React, { useState, useContext, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Switch, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';
import { AuthContext } from '../context/AuthContext';
import LocalCache from '../services/LocalCache';
import Logger from '../utils/Logger';

const MONTHS_FULL_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function ConfigScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id || 0;
  const C = useColors();
  const insets = useSafeAreaInsets();

  const [hourValues, setHourValues] = useState({
    weekday: { day: 130, night: 143 },
    weekend: { day: 170, night: 185 },
  });
  const [loyaltyOptions, setLoyaltyOptions] = useState([
    { percentage: 10, minHours: 72,  active: false },
    { percentage: 20, minHours: 120, active: false },
    { percentage: 25, minHours: 168, active: false },
    { percentage: 30, minHours: 264, active: false },
  ]);
  const [bonusEnabled, setBonusEnabled]           = useState(false);
  const [bonus, setBonus]                         = useState({ percentage: 5, startMonth: 3, endMonth: 4 });
  const [fridayNightAsWeekend, setFridayNightAsWeekend] = useState(false);
  const [fractionalExtraHours, setFractionalExtraHours] = useState(true);

  React.useEffect(() => { loadSaved(); }, []);

  const loadSaved = async () => {
    try {
      let cfg = userId ? await LocalCache.getFinancialConfig(userId) : null;
      if (!cfg) {
        const raw = await SecureStore.getItemAsync('shift_configurations');
        if (raw) cfg = JSON.parse(raw);
      }
      if (!cfg) return;
      if (cfg.hourValues)               setHourValues(cfg.hourValues);
      if (cfg.loyaltyOptions)           setLoyaltyOptions(cfg.loyaltyOptions);
      if (cfg.bonusEnabled !== undefined) setBonusEnabled(cfg.bonusEnabled);
      if (cfg.bonus)                    setBonus(cfg.bonus);
      if (cfg.fridayNightAsWeekend !== undefined) setFridayNightAsWeekend(cfg.fridayNightAsWeekend);
      if (cfg.fractionalExtraHours !== undefined) setFractionalExtraHours(cfg.fractionalExtraHours);
    } catch (e) {
      Logger.warn('ConfigScreen: erro ao carregar', e);
    }
  };

  const save = async () => {
    try {
      const now = new Date();
      const loyaltyEnabled = loyaltyOptions.some(o => o.active);
      const cfg = {
        hourValues, loyaltyEnabled, loyaltyOptions,
        bonusEnabled, bonus, fridayNightAsWeekend, fractionalExtraHours,
        savedAt: now.toISOString(),
      };
      await SecureStore.setItemAsync('shift_configurations', JSON.stringify(cfg));
      if (userId) {
        const existing = await LocalCache.getFinancialConfig(userId);
        await LocalCache.saveFinancialConfig(userId, {
          ...cfg, userId,
          version: (existing?.version || 0) + 1,
          effectiveFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          updatedAt: now.toISOString(),
        });
      }
      navigation?.goBack?.();
    } catch (e) {
      Logger.error('ConfigScreen: erro ao salvar', e);
    }
  };

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: () => (
        <Pressable onPress={save} hitSlop={12} style={{ paddingRight: 4 }}>
          <Text style={{ color: C.primary, fontSize: 15, fontFamily: Typography.fontFamily.semiBold, fontWeight: '700' }}>Salvar</Text>
        </Pressable>
      ),
    });
  }, [hourValues, loyaltyOptions, bonusEnabled, bonus, fridayNightAsWeekend, fractionalExtraHours]);

  const handleHourChange = (period, type, value) =>
    setHourValues(p => ({ ...p, [period]: { ...p[period], [type]: value } }));

  const handleBonusChange = (field, value) =>
    setBonus(p => ({ ...p, [field]: value }));

  const activeTier = loyaltyOptions.find(o => o.active);

  const vals = [hourValues.weekday.day, hourValues.weekday.night, hourValues.weekend.day, hourValues.weekend.night];
  const avgRate = vals.reduce((a, b) => a + Number(b || 0), 0) / vals.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background.secondary }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={{ paddingHorizontal: Spacing.screen, paddingTop: 14, paddingBottom: 0 }}>
        <Text style={[t.eyebrow, { color: C.text.tertiary }]}>Hora média efetiva</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <Text style={[t.heroValue, { color: C.money, fontFamily: Typography.fontFamily.display }]}>
            R$ {avgRate.toFixed(2).replace('.', ',')}
          </Text>
          <Text style={[t.heroUnit, { color: C.text.secondary }]}>/hora</Text>
        </View>
        <Text style={[t.heroHint, { color: C.text.tertiary }]}>
          Inclui fidelização e bônus geral. Multiplicadores aplicados nos plantões.
        </Text>
      </View>

      {/* Valor por hora */}
      <SL C={C} top>Valor por hora</SL>
      <View style={{ paddingHorizontal: Spacing.screen, gap: 10 }}>
        <RateBlock title="Plantões de semana" subtitle="seg → sex" accent={C.primary} C={C}>
          <RateInputRow C={C} icon="sunny-outline" label="Manhã / Tarde" sub="07:00 – 19:00"
            value={hourValues.weekday.day} onChange={v => handleHourChange('weekday', 'day', v)} />
          <RateInputRow C={C} icon="moon-outline" label="Noite" sub="19:00 – 07:00"
            value={hourValues.weekday.night} onChange={v => handleHourChange('weekday', 'night', v)} last />
        </RateBlock>
        <RateBlock title="Plantões de FDS" subtitle="sáb · dom · feriado" accent={C.warning} C={C}>
          <RateInputRow C={C} icon="sunny-outline" label="Manhã / Tarde" sub="07:00 – 19:00"
            value={hourValues.weekend.day} onChange={v => handleHourChange('weekend', 'day', v)} />
          <RateInputRow C={C} icon="moon-outline" label="Noite" sub="19:00 – 07:00"
            value={hourValues.weekend.night} onChange={v => handleHourChange('weekend', 'night', v)} last />
        </RateBlock>
      </View>

      {/* Regras FDS */}
      <SL C={C} top>Regras de fim de semana</SL>
      <View style={[card(C), { marginHorizontal: Spacing.screen }]}>
        <ToggleRow C={C}
          iconName="partly-sunny-outline" iconColor={C.warning} iconBg={C.warning + '1a'}
          label="Sex. noite conta como FDS"
          hint="19:00 sex → 07:00 sáb"
          value={fridayNightAsWeekend}
          onValueChange={setFridayNightAsWeekend}
        />
      </View>

      {/* Fidelização */}
      <SL C={C} top>
        {'Fidelização'}
        <Text style={{ color: C.text.tertiary, fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}> · definido pelo hospital</Text>
      </SL>
      <View style={[card(C), { marginHorizontal: Spacing.screen, padding: 14 }]}>
        <Text style={[t.fidelityHint, { color: C.text.secondary }]}>
          {activeTier
            ? `Você está em +${activeTier.percentage}%. Bônus aplicado conforme as horas trabalhadas no mês.`
            : 'Selecione a faixa de fidelização ativa do seu hospital.'}
        </Text>
        <View style={{ marginTop: 12 }}>
          <FidelityScale
            C={C}
            tiers={loyaltyOptions.map(o => ({ hours: o.minHours, pct: o.percentage }))}
            current={activeTier?.minHours ?? null}
            onSelect={hours => setLoyaltyOptions(p => p.map(o => ({ ...o, active: o.minHours === hours && !o.active ? true : o.minHours === hours ? false : false })))}
            onToggle={hours => setLoyaltyOptions(p => p.map(o => ({ ...o, active: o.minHours === hours ? !o.active : false })))}
          />
        </View>
      </View>

      {/* Bônus geral */}
      <SL C={C} top>Bônus geral</SL>
      <View style={[card(C), { marginHorizontal: Spacing.screen }]}>
        <ToggleRow C={C}
          iconName="sparkles-outline" iconColor={C.primary} iconBg={C.accentSoft}
          label="Aplicar bônus geral"
          hint={`+ ${bonus.percentage}% sobre todos os plantões`}
          value={bonusEnabled}
          onValueChange={setBonusEnabled}
        />
        {bonusEnabled && (
          <>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light, marginLeft: 14 }} />
            <BonusDetail C={C} bonus={bonus} onChange={handleBonusChange} />
          </>
        )}
      </View>

      {/* Outros */}
      <SL C={C} top>Outros</SL>
      <View style={[card(C), { marginHorizontal: Spacing.screen }]}>
        <ToggleRow C={C}
          iconName="timer-outline" iconColor={C.primary} iconBg={C.accentSoft}
          label="Frações de hora"
          hint="Cobrar minutos extras proporcionalmente"
          value={fractionalExtraHours}
          onValueChange={setFractionalExtraHours}
        />
      </View>

      <Text style={[t.disclaimer, { color: C.text.tertiary }]}>
        Estas configurações são salvas no seu dispositivo. A fidelização e os valores-base vêm do hospital — alterações aqui afetam apenas a estimativa exibida no app.
      </Text>
    </ScrollView>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

const card = (C) => ({
  backgroundColor: C.background.elevated,
  borderRadius: 14,
  borderWidth: 0.5,
  borderColor: C.border.light,
  overflow: 'hidden',
  ...Shadows.small,
});

function SL({ C, children, top }) {
  return (
    <Text style={[t.sectionLabel, { color: C.text.tertiary, marginTop: top ? Spacing.lg : 0 }]}>
      {children}
    </Text>
  );
}

function RateBlock({ C, title, subtitle, accent, children }) {
  return (
    <View style={[card(C)]}>
      <View style={[t.rateBlockHeader, { backgroundColor: accent + '14', borderBottomColor: C.border.light }]}>
        <Text style={[t.rateBlockTitle, { color: accent }]}>{title}</Text>
        <Text style={[t.rateBlockSubtitle, { color: C.text.tertiary }]}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function RateInputRow({ C, icon, label, sub, value, onChange, last }) {
  return (
    <View>
      <View style={t.rateRow}>
        <View style={[t.rateRowIcon, { backgroundColor: C.background.secondary }]}>
          <Ionicons name={icon} size={15} color={C.text.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.rateRowLabel, { color: C.text.primary }]}>{label}</Text>
          <Text style={[t.rateRowSub, { color: C.text.tertiary, fontFamily: Typography.fontFamily.regular }]}>{sub}</Text>
        </View>
        <View style={[t.ratePill, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
          <Text style={[t.ratePillPrefix, { color: C.text.tertiary }]}>R$</Text>
          <TextInput
            style={[t.ratePillInput, { color: C.text.primary, fontFamily: Typography.fontFamily.semiBold }]}
            value={String(value || '')}
            onChangeText={onChange}
            keyboardType="numeric"
            selectTextOnFocus
          />
          <Text style={[t.ratePillSuffix, { color: C.text.tertiary }]}>/h</Text>
        </View>
      </View>
      {!last && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border.light, marginLeft: 14 }} />}
    </View>
  );
}

function ToggleRow({ C, iconName, iconColor, iconBg, label, hint, value, onValueChange }) {
  return (
    <View style={t.toggleRow}>
      <View style={[t.toggleIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[t.toggleLabel, { color: C.text.primary }]}>{label}</Text>
        {hint ? <Text style={[t.toggleHint, { color: C.text.tertiary }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.border.medium, true: C.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

function FidelityScale({ C, tiers, current, onToggle }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {tiers.map((tier, i) => {
        const active = tier.hours === current;
        return (
          <Pressable
            key={i}
            style={[
              t.tierCell,
              {
                backgroundColor: active ? C.accentSoft : 'transparent',
                borderColor: active ? C.primary + '40' : 'transparent',
                flex: 1,
              },
            ]}
            onPress={() => onToggle(tier.hours)}
          >
            <Text style={[t.tierPct, { color: active ? C.primary : C.text.tertiary, fontFamily: Typography.fontFamily.display }]}>
              +{tier.pct}%
            </Text>
            <Text style={[t.tierHours, { color: C.text.tertiary, fontFamily: Typography.fontFamily.regular }]}>
              {tier.hours}h
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BonusDetail({ C, bonus, onChange }) {
  const [editing, setEditing] = useState(null); // 'from' | 'to' | null
  const from = bonus.startMonth - 1;
  const to   = bonus.endMonth   - 1;

  const pickMonth = (i) => {
    if (editing === 'from') {
      if (i <= to) onChange('startMonth', i + 1);
      else { onChange('startMonth', to + 1); onChange('endMonth', i + 1); }
    } else {
      if (i >= from) onChange('endMonth', i + 1);
      else { onChange('endMonth', from + 1); onChange('startMonth', i + 1); }
    }
    setEditing(null);
  };

  return (
    <View style={{ padding: 14, gap: 14 }}>
      {/* Percentual */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[t.subLabel, { color: C.text.tertiary }]}>Percentual do bônus</Text>
        <View style={[t.ratePill, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
          <Text style={[t.ratePillPrefix, { color: C.text.tertiary }]}>+</Text>
          <TextInput
            style={[t.ratePillInput, { color: C.text.primary, fontFamily: Typography.fontFamily.semiBold }]}
            value={String(bonus.percentage || '')}
            onChangeText={v => onChange('percentage', v)}
            keyboardType="numeric"
            selectTextOnFocus
          />
          <Text style={[t.ratePillSuffix, { color: C.text.tertiary }]}>%</Text>
        </View>
      </View>

      {/* Vigência pickers */}
      <View>
        <Text style={[t.subLabel, { color: C.text.tertiary, marginBottom: 10 }]}>Vigência</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {(['from', 'to']).map((end, idx) => {
            const isActive = editing === end;
            const monthIdx = end === 'from' ? from : to;
            return (
              <React.Fragment key={end}>
                <Pressable
                  style={[t.monthPickerBtn, {
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    backgroundColor: isActive ? C.accentSoft : C.background.secondary,
                    borderColor: isActive ? C.primary : C.border.light,
                    borderWidth: isActive ? 1.5 : 0.5,
                  }]}
                  onPress={() => setEditing(isActive ? null : end)}
                >
                  <Text style={[t.monthPickerLabel, { color: isActive ? C.primary : C.text.tertiary, marginBottom: 2 }]}>
                    {end === 'from' ? 'Início' : 'Fim'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Text style={[t.monthPickerValue, { color: isActive ? C.primary : C.text.primary, fontFamily: Typography.fontFamily.semiBold, flex: 1 }]}>
                      {MONTHS_FULL_PT[monthIdx]}
                    </Text>
                    <Ionicons name={isActive ? 'chevron-up' : 'chevron-down'} size={13} color={isActive ? C.primary : C.text.tertiary} />
                  </View>
                </Pressable>
                {idx === 0 && (
                  <Ionicons name="arrow-forward" size={14} color={C.text.tertiary} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {editing !== null && (
          <View style={[t.monthGrid, { backgroundColor: C.background.secondary, borderColor: C.border.light }]}>
            {Array.from({ length: 4 }).map((_, row) => (
              <View key={row} style={{ flexDirection: 'row' }}>
                {[0, 1, 2].map((col) => {
                  const i = row * 3 + col;
                  const inRange  = i >= from && i <= to;
                  const isFrom   = i === from;
                  const isTo     = i === to;
                  const isTarget = editing === 'from' ? i === from : i === to;
                  return (
                    <Pressable
                      key={i}
                      style={[t.monthGridCell, {
                        backgroundColor: inRange ? C.accentSoft : 'transparent',
                        borderTopLeftRadius:     isFrom ? 8 : 0,
                        borderBottomLeftRadius:  isFrom ? 8 : 0,
                        borderTopRightRadius:    isTo   ? 8 : 0,
                        borderBottomRightRadius: isTo   ? 8 : 0,
                      }]}
                      onPress={() => pickMonth(i)}
                    >
                      <Text style={[t.monthGridText, {
                        color: isTarget ? C.primary : inRange ? C.primary : C.text.secondary,
                        fontWeight: isTarget ? '800' : inRange ? '700' : '500',
                      }]}>
                        {MONTHS_FULL_PT[i]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── static styles (no C dependency) ──────────────────────────────────────────
const t = StyleSheet.create({
  eyebrow:     { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroValue:   { fontSize: 36, fontWeight: '800', letterSpacing: -0.8, lineHeight: 42 },
  heroUnit:    { fontSize: 13 },
  heroHint:    { fontSize: 12, marginTop: 4 },

  sectionLabel: {
    fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: Spacing.sm, marginTop: 0,
    paddingHorizontal: Spacing.screen,
  },

  rateBlockHeader: {
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rateBlockTitle:    { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
  rateBlockSubtitle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },

  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rateRowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rateRowLabel: { fontSize: 13, fontWeight: '700' },
  rateRowSub:   { fontSize: 11, marginTop: 1 },
  ratePill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 2,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 0.5,
  },
  ratePillPrefix: { fontSize: 10, fontWeight: '600' },
  ratePillInput:  { fontSize: 17, fontWeight: '600', minWidth: 44, textAlign: 'center' },
  ratePillSuffix: { fontSize: 10 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 52 },
  toggleIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toggleLabel: { fontSize: 14, fontWeight: '700' },
  toggleHint:  { fontSize: 11, marginTop: 1 },

  tierCell: { padding: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  tierPct:   { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  tierHours: { fontSize: 10, marginTop: 1 },

  monthPickerBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  monthPickerLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  monthPickerValue: { fontSize: 15, fontWeight: '600' },
  monthGrid: { marginTop: 8, borderRadius: 10, borderWidth: 0.5, overflow: 'hidden' },
  monthGridCell: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  monthGridText: { fontSize: 12 },

  subLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  fidelityHint: { fontSize: 11.5, lineHeight: 17 },
  disclaimer: { fontSize: 11, lineHeight: 16, paddingHorizontal: Spacing.screen, paddingTop: 20, paddingBottom: 24 },
});
