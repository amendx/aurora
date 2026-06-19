import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Switch,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';
import { useOffers } from '../contexts/OffersContext';

const ROWS = [
  {
    key: 'cededInMyGroups',
    title: 'Plantões cedidos no meu grupo',
    desc: 'Avisar quando outro membro abrir um plantão para o grupo ou me oferecer diretamente.',
    icon: 'people-outline',
  },
  {
    key: 'swapProposalsToMe',
    title: 'Propostas de troca',
    desc: 'Avisar quando alguém propuser uma troca de plantão comigo.',
    icon: 'swap-horizontal',
  },
  {
    key: 'myOfferOutcomes',
    title: 'Resultado das minhas ofertas',
    desc: 'Avisar quando uma oferta ou troca que eu enviei for aceita, recusada ou expirada.',
    icon: 'checkmark-done-outline',
  },
];

export default function NotificationsSettingsScreen({ navigation }) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);
  const { prefs, savePrefs } = useOffers();
  const [local, setLocal] = useState(prefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(prefs); }, [prefs]);

  const persist = async (next) => {
    setLocal(next);
    setSaving(true);
    await savePrefs(next);
    setSaving(false);
  };

  const toggle = (key) => persist({ ...local, [key]: !local[key] });
  const toggleMaster = () => persist({ ...local, enabled: !local.enabled });

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation?.goBack?.()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.primary} />
        </Pressable>
        <Text style={[s.title, { color: C.text.primary }]}>Notificações</Text>
        {saving && <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.screen, paddingBottom: Spacing.lg }}>
        {/* Master toggle */}
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="notifications-outline" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Receber notificações</Text>
              <Text style={s.rowDesc}>Liga ou desliga todas as notificações do aplicativo.</Text>
            </View>
            <Switch
              value={!!local.enabled}
              onValueChange={toggleMaster}
              trackColor={{ false: C.border.medium, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Per-event toggles */}
        <Text style={s.sectionLabel}>Tipos de notificação</Text>
        <View style={[s.card, { backgroundColor: C.background.elevated, borderColor: C.border.light, opacity: local.enabled ? 1 : 0.45 }]}>
          {ROWS.map((r, i) => (
            <View key={r.key} style={[s.row, i < ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border.light }]}>
              <View style={[s.rowIcon, { backgroundColor: C.background.secondary }]}>
                <Ionicons name={r.icon} size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{r.title}</Text>
                <Text style={s.rowDesc}>{r.desc}</Text>
              </View>
              <Switch
                value={!!local[r.key]}
                onValueChange={() => toggle(r.key)}
                disabled={!local.enabled}
                trackColor={{ false: C.border.medium, true: C.primary }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingBottom: 12, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: Typography.fontFamily.display, fontWeight: '700' },

  card: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.md },
  sectionLabel: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: C.text.tertiary, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 60 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.text.primary },
  rowDesc: { fontSize: 11.5, color: C.text.tertiary, marginTop: 2, lineHeight: 15 },
});
