import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, TextInput, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, Typography, BorderRadius } from '../constants/DesignSystem';

/**
 * Modal de seleção de grupo — single-select.
 *
 * - Lista grupos visíveis. Toque em um → confirma e fecha.
 * - Busca por nome ou instituição.
 *
 * Selection model: Set<groupId> (sempre tamanho 1).
 */
const GroupPickerModal = ({ visible, groups = [], selection, onClose, onConfirm }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(C);

  const initialId = useMemo(() => {
    if (selection instanceof Set && selection.size > 0) return String([...selection][0]);
    return groups[0] ? String(groups[0].id) : null;
  }, [selection, groups, visible]);

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const resolveColor = (g) => {
    const raw = g?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => {
      const name = String(g.name || '').toLowerCase();
      const inst = String(g.institution?.name || '').toLowerCase();
      return name.includes(q) || inst.includes(q);
    });
  }, [groups, query]);

  const pick = (gid) => {
    onConfirm?.(new Set([String(gid)]));
    onClose?.();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.handle} />

        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Selecionar grupo</Text>
            <Text style={s.subtitle}>{groups.length} disponíveis</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={22} color={C.text.secondary} />
          </Pressable>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.text.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar grupo ou instituição"
            placeholderTextColor={C.text.tertiary}
            style={s.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={C.text.tertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ maxHeight: 460 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <Text style={s.empty}>Nenhum grupo encontrado.</Text>
          ) : filtered.map(g => {
            const id = String(g.id);
            const sel = id === initialId;
            const color = resolveColor(g);
            return (
              <TouchableOpacity
                key={id}
                style={[s.row, sel && { backgroundColor: C.accentSoft + '40' }]}
                onPress={() => pick(id)}
              >
                <Ionicons
                  name={sel ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={sel ? C.primary : C.text.tertiary}
                />
                <View style={[s.colorDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.groupName} numberOfLines={1}>{g.name}</Text>
                  {!!g.institution?.name && (
                    <Text style={s.groupMeta} numberOfLines={1}>{g.institution.name}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
};

const makeStyles = (C) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.background.elevated,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border.medium, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontFamily: Typography.fontFamily.display, fontWeight: '700', color: C.text.primary },
  subtitle: { fontSize: 12, color: C.text.tertiary, marginTop: 2 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    marginHorizontal: 18, marginBottom: 10,
    borderRadius: 10,
    backgroundColor: C.background.secondary,
    borderWidth: 0.5, borderColor: C.border.light,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text.primary, paddingVertical: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10,
    marginBottom: 4,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  groupName: { fontSize: 14, fontWeight: '600', color: C.text.primary },
  groupMeta: { fontSize: 11, color: C.text.tertiary, marginTop: 1 },
  empty: { fontSize: 13, color: C.text.tertiary, textAlign: 'center', paddingVertical: 28 },
});

export default GroupPickerModal;
