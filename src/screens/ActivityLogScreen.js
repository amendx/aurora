/**
 * ActivityLogScreen — exibe o buffer in-memory do ActivityLogger.
 *
 * Atualiza por refresh manual (puxar) ou auto-poll de 2s enquanto a tela
 * estiver visível. Nada é persistido — buffer dura enquanto o app não
 * for fechado.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ActivityLogger from '../utils/ActivityLogger';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';

const _fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const ActivityLogScreen = () => {
  const C = useColors();
  const s = makeStyles(C);

  const [entries, setEntries] = useState(ActivityLogger.getBuffer());
  const [refreshing, setRefreshing] = useState(false);

  // Live poll: refresh every 2s while mounted.
  useEffect(() => {
    const t = setInterval(() => setEntries(ActivityLogger.getBuffer()), 2000);
    return () => clearInterval(t);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setEntries(ActivityLogger.getBuffer());
    setRefreshing(false);
  };

  const onClear = () => {
    ActivityLogger.clear();
    setEntries([]);
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: Spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={s.header}>
        <Text style={s.intro}>
          Cronologia das suas ações nesta sessão. Não é persistido — some ao fechar o app.
        </Text>
        <Pressable style={s.clearBtn} onPress={onClear}>
          <Ionicons name="trash-outline" size={14} color={C.error} />
          <Text style={[s.clearBtnText, { color: C.error }]}>Limpar</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <Text style={s.empty}>Sem ações registradas ainda.</Text>
      ) : (
        <View style={s.list}>
          {[...entries].reverse().map((e, i) => (
            <View key={`${e.ts}-${i}`} style={s.row}>
              <Text style={s.time}>{_fmtTime(e.ts)}</Text>
              <Text style={s.line}>{e.line}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  container: { flex: 1, backgroundColor: C.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 10,
  },
  intro: {
    flex: 1,
    fontSize: 12,
    color: C.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 16,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.error + '14',
    borderWidth: 0.5,
    borderColor: C.error + '40',
  },
  clearBtnText: { fontSize: 11, fontFamily: Typography.fontFamily.bold },
  empty: {
    fontSize: 13,
    color: C.text.tertiary,
    textAlign: 'center',
    paddingVertical: 36,
  },
  list: {
    paddingHorizontal: Spacing.screen,
    gap: 6,
  },
  row: {
    backgroundColor: C.background.card,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  time: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  line: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.primary,
    lineHeight: 18,
  },
});

export default ActivityLogScreen;
