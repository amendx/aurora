import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StyleSheet, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors, Spacing, BorderRadius, Shadows } from '../constants/DesignSystem';
import { useOpenings } from '../contexts/OpeningsContext';

const SOFFIA_BASE = 'https://soffia.co';

function SourceBadge({ source, C }) {
  const isAurora = source === 'aurora';
  return (
    <View style={[badge.wrap, { backgroundColor: isAurora ? C.primary + '1a' : C.text.tertiary + '18' }]}>
      <Text style={[badge.text, { color: isAurora ? C.primary : C.text.tertiary }]}>
        {isAurora ? 'Aurora' : 'PlantãoAtivo'}
      </Text>
    </View>
  );
}

function OpeningCard({ item, onClaim, C }) {
  const [claiming, setClaiming] = useState(false);
  const startDate = new Date(item.startISO);
  const endDate = item.endISO ? new Date(item.endISO) : null;

  const fmt = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

  const handleClaim = async () => {
    if (item.source === 'webClient') {
      const url = item.webClientTransactionId
        ? `${SOFFIA_BASE}/shifts/${item.webClientTransactionId}`
        : SOFFIA_BASE;
      Linking.openURL(url).catch(() => {});
      return;
    }
    setClaiming(true);
    await onClaim(item.id);
    setClaiming(false);
  };

  const groupColor = item.group?.color || C.primary;

  return (
    <View style={[card.wrap, { backgroundColor: C.background.elevated, borderColor: C.border.light, ...Shadows.small }]}>
      {/* Color strip */}
      <View style={[card.strip, { backgroundColor: groupColor }]} />

      <View style={card.body}>
        {/* Header row */}
        <View style={card.headerRow}>
          <View style={[card.labelBadge, { backgroundColor: groupColor + '22' }]}>
            <Text style={[card.labelText, { color: groupColor }]}>{item.label}</Text>
          </View>
          <SourceBadge source={item.source} C={C} />
          {item.originUserId ? (
            <View style={[badge.wrap, { backgroundColor: C.money + '18' }]}>
              <Text style={[badge.text, { color: C.money }]}>Cedido</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {item.availableSlots > 0 && (
            <View style={[card.slotsBadge, { backgroundColor: C.money + '18' }]}>
              <Text style={[card.slotsText, { color: C.money }]}>
                {item.availableSlots} vaga{item.availableSlots !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Institution + group */}
        <Text style={[card.institution, { color: C.text.primary }]} numberOfLines={1}>
          {item.group?.institution?.name || item.group?.name || '—'}
        </Text>
        <Text style={[card.groupName, { color: C.text.tertiary }]} numberOfLines={1}>
          {item.group?.name}
          {item.group?.institution?.city ? ` · ${item.group.institution.city}` : ''}
        </Text>

        {/* Time */}
        <Text style={[card.time, { color: C.text.secondary }]}>
          {fmtDate(startDate)} · {fmt(startDate)}{endDate ? ` – ${fmt(endDate)}` : ''}
          {' '}({Math.round(item.durationMinutes / 60)}h)
        </Text>

        {/* Estimated value */}
        {item.estimatedValue != null && (
          <Text style={[card.value, { color: C.money }]}>
            {item.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </Text>
        )}

        {/* Coworkers */}
        {item.coworkers?.length > 0 && (
          <Text style={[card.coworkers, { color: C.text.tertiary }]} numberOfLines={1}>
            {item.coworkers.map(c => c.name.split(' ')[0]).join(', ')}
          </Text>
        )}

        {/* CTA */}
        {item.availableSlots > 0 && (
          <Pressable
            style={[card.cta, {
              backgroundColor: item.source === 'aurora' ? C.primary : C.text.tertiary + '22',
            }]}
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming
              ? <ActivityIndicator size="small" color={item.source === 'aurora' ? '#fff' : C.text.secondary} />
              : (
                <Text style={[card.ctaText, { color: item.source === 'aurora' ? '#fff' : C.text.secondary }]}>
                  {item.source === 'aurora' ? 'Quero esse plantão' : 'Assumir via PlantãoAtivo →'}
                </Text>
              )
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function OpeningsScreen() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const { openings, loading, error, refresh, claimOpening } = useOpenings();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { refresh(true); }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh(true);
    setRefreshing(false);
  }, [refresh]);

  const vacancies = openings.filter(o => o.availableSlots > 0);
  const filled = openings.filter(o => o.availableSlots === 0);

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {loading && !refreshing ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={C.text.tertiary} />
          <Text style={[s.errorText, { color: C.text.tertiary }]}>{error}</Text>
          <Pressable onPress={() => refresh(true)} style={[s.retryBtn, { borderColor: C.primary }]}>
            <Text style={[s.retryText, { color: C.primary }]}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.screen, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {openings.length === 0 ? (
            <View style={[s.empty, { backgroundColor: C.background.elevated, borderColor: C.border.light }]}>
              <Ionicons name="calendar-outline" size={28} color={C.text.tertiary} style={{ marginBottom: 10 }} />
              <Text style={[s.emptyText, { color: C.text.tertiary }]}>Nenhuma vaga disponível</Text>
            </View>
          ) : (
            <>
              {vacancies.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { color: C.text.tertiary }]}>
                    {vacancies.length} vaga{vacancies.length !== 1 ? 's' : ''} em aberto
                  </Text>
                  {vacancies.map(item => (
                    <OpeningCard key={item.id} item={item} onClaim={claimOpening} C={C} />
                  ))}
                </>
              )}
              {filled.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { color: C.text.tertiary, marginTop: Spacing.lg }]}>Preenchidas</Text>
                  {filled.map(item => (
                    <OpeningCard key={item.id} item={item} onClaim={claimOpening} C={C} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  text: { fontSize: 10, fontWeight: '700' },
});

const card = StyleSheet.create({
  wrap: { borderRadius: BorderRadius.md, borderWidth: 0.5, overflow: 'hidden', marginBottom: Spacing.sm, flexDirection: 'row' },
  strip: { width: 4 },
  body: { flex: 1, padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  labelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  labelText: { fontSize: 12, fontWeight: '800' },
  slotsBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  slotsText: { fontSize: 10, fontWeight: '700' },
  institution: { fontSize: 15, fontWeight: '700', marginBottom: 1 },
  groupName: { fontSize: 11, marginBottom: 4 },
  time: { fontSize: 12, marginBottom: 2 },
  value: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  coworkers: { fontSize: 11, marginBottom: 6 },
  cta: { marginTop: 8, paddingVertical: 9, borderRadius: BorderRadius.pill, alignItems: 'center' },
  ctaText: { fontSize: 13, fontWeight: '700' },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: BorderRadius.pill, borderWidth: 1 },
  retryText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  empty: { borderRadius: BorderRadius.md, borderWidth: 0.5, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
});
