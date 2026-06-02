import React from 'react';
import { ScrollView, View, Text, Pressable } from 'react-native';
import { useColors, Typography, Spacing } from '../constants/DesignSystem';

/**
 * Horizontal chips to filter the group calendar view.
 * - "Todos" chip is the default and mutually exclusive with individual chips.
 * - Tapping an individual chip while "Todos" is selected switches to single-selection mode.
 * - Tapping individual chips toggles their inclusion in the visible set.
 */
const GroupFilterChips = ({ groups, selection, onChange }) => {
  const C = useColors();
  const s = makeStyles(C);

  const isAll = selection === 'all' || selection == null;
  const set = !isAll && selection instanceof Set ? selection : new Set();

  const toggle = (groupId) => {
    if (isAll) {
      onChange(new Set([String(groupId)]));
      return;
    }
    const next = new Set(set);
    const id = String(groupId);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) {
      onChange('all');
    } else {
      onChange(next);
    }
  };

  const resolveColor = (g) => {
    const raw = g?.color;
    return raw ? (raw.startsWith('#') ? raw : `#${raw}`) : C.primary;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
    >
      <Pressable
        onPress={() => onChange('all')}
        style={[s.chip, isAll && s.chipActiveNeutral]}
      >
        <Text style={[s.chipLabel, isAll && s.chipLabelActive]}>Todos</Text>
      </Pressable>

      {(groups || []).map((g) => {
        const color = resolveColor(g);
        const selected = !isAll && set.has(String(g.id));
        return (
          <Pressable
            key={g.id}
            onPress={() => toggle(g.id)}
            style={[
              s.chip,
              selected && { borderColor: color, backgroundColor: color + '1f' },
            ]}
          >
            <View style={[s.dot, { backgroundColor: color }]} />
            <Text
              style={[s.chipLabel, selected && { color: C.text.primary, fontFamily: Typography.fontFamily.bold }]}
              numberOfLines={1}
            >
              {g.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const makeStyles = (C) => ({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.sm,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: C.border.light,
    backgroundColor: C.background.card,
  },
  chipActiveNeutral: {
    backgroundColor: C.text.primary,
    borderColor: C.text.primary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.secondary,
    maxWidth: 140,
  },
  chipLabelActive: {
    color: C.background.card,
    fontFamily: Typography.fontFamily.bold,
  },
});

export default GroupFilterChips;
