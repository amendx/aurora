import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGroups } from '../contexts/GroupsContext';
import { useColors, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

export default function HospitalsScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { groups: groupsById } = useGroups();
  const [loyaltyCfg, setLoyaltyCfg] = useState({});

  useEffect(() => {
    SecureStore.getItemAsync('shift_configurations').then(raw => {
      if (raw) {
        const parsed = JSON.parse(raw);
        setLoyaltyCfg(parsed.institutionLoyalty || {});
      }
    }).catch(() => {});
  }, []);

  // Deduplicate institutions from all groups
  const institutions = useMemo(() => {
    const seen = {};
    Object.values(groupsById).forEach(g => {
      const inst = g.institution;
      if (!inst?.id) return;
      if (!seen[inst.id]) {
        seen[inst.id] = { id: inst.id, name: inst.name, groups: [] };
      }
      seen[inst.id].groups.push(g);
    });
    return Object.values(seen).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [groupsById]);

  const getLoyaltyBadge = (instId) => {
    const cfg = loyaltyCfg[String(instId)];
    if (!cfg) return null;
    if (cfg.autoFromHours) return 'Auto';
    if (cfg.manualPercentage > 0) return `+${cfg.manualPercentage}%`;
    return null;
  };

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + 32 }}>
        {institutions.length === 0 ? (
          <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
            <Ionicons name="business-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
            <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhum hospital vinculado.</Text>
            <Text style={[s.emptyHint, { color: C.text.tertiary }]}>Os hospitais aparecem automaticamente conforme seus grupos.</Text>
          </View>
        ) : (
          <View style={[s.list, { backgroundColor: C.background.elevated, borderColor: C.border.light, ...Shadows.small }]}>
            {institutions.map((inst, i) => {
              const badge = getLoyaltyBadge(inst.id);
              return (
                <Pressable
                  key={inst.id}
                  style={[s.row, i < institutions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border.light }]}
                  onPress={() => navigation?.navigate?.('HospitalDetailScreen', { institution: inst })}
                >
                  <View style={[s.iconWrap, { backgroundColor: C.accentSoft }]}>
                    <Ionicons name="business-outline" size={16} color={C.primary} />
                  </View>
                  <View style={s.rowContent}>
                    <Text style={[s.rowTitle, { color: C.text.primary }]} numberOfLines={1}>{inst.name}</Text>
                    <Text style={[s.rowSub, { color: C.text.tertiary }]} numberOfLines={1}>
                      {inst.groups.map(g => g.name).join(' · ')}
                    </Text>
                  </View>
                  {badge ? (
                    <View style={[s.badge, { backgroundColor: C.money + '1a' }]}>
                      <Text style={[s.badgeText, { color: C.money }]}>{badge}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={C.text.tertiary} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  list: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  empty: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
