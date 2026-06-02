import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useColors, Typography, Spacing, Shadows } from '../constants/DesignSystem';

const CalendarModePill = ({ mode, onChange }) => {
  const C = useColors();
  const s = makeStyles(C);

  return (
    <View style={s.wrap}>
      <View style={s.pill}>
        <Pressable
          style={[s.segment, mode === 'mine' && s.segmentActive]}
          onPress={() => mode !== 'mine' && onChange('mine')}
        >
          <Text style={[s.label, mode === 'mine' && s.labelActive]}>Meus plantões</Text>
        </Pressable>
        <Pressable
          style={[s.segment, mode === 'groups' && s.segmentActive]}
          onPress={() => mode !== 'groups' && onChange('groups')}
        >
          <Text style={[s.label, mode === 'groups' && s.labelActive]}>Meus grupos</Text>
        </Pressable>
      </View>
    </View>
  );
};

const makeStyles = (C) => ({
  wrap: {
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: C.background.secondary,
    borderRadius: 999,
    padding: 4,
    borderWidth: 0.5,
    borderColor: C.border.light,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentActive: {
    backgroundColor: C.background.card,
    ...Shadows.small,
  },
  label: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.secondary,
    letterSpacing: -0.1,
  },
  labelActive: {
    color: C.text.primary,
    fontFamily: Typography.fontFamily.bold,
  },
});

export default CalendarModePill;
