import React from 'react';
import { View, Text } from 'react-native';
import { useColors, Typography, Shadows } from '../constants/DesignSystem';

/**
 * Card shown below the calendar when in "Meus grupos" mode.
 * Title:   "Grupos"
 * Body:    nomes dos grupos agrupados por instituição.
 * Stats:   Cobertura % (filled / capacity) + Vagas abertas em N dias.
 */
const GroupSummaryCard = ({
  groups = [],
  coverage = null,        // null = sem dados; 0-100 quando há capacity > 0
  openVacancies = 0,
  vacancyDays = 0,
  loading = false,
}) => {
  const C = useColors();
  const s = makeStyles(C);

  const byInstitution = {};
  for (const g of groups) {
    const inst = g?.institution?.name || 'Sem instituição';
    if (!byInstitution[inst]) byInstitution[inst] = [];
    byInstitution[inst].push(g.name || '');
  }
  const institutionLines = Object.entries(byInstitution).map(([inst, names]) => ({
    inst,
    text: names.filter(Boolean).join(', '),
  }));

  let coverageColor = C.text.primary;
  if (coverage != null) {
    if (coverage < 50) coverageColor = C.error;
    else if (coverage < 80) coverageColor = C.warning;
  }

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Text style={s.title}>Grupos</Text>
      </View>

      {institutionLines.length > 0 && (
        <View style={s.body}>
          {institutionLines.map(({ inst, text }) => (
            <View key={inst} style={s.instLine}>
              <Text style={s.instName} numberOfLines={1}>{inst}</Text>
              {!!text && <Text style={s.groupNames} numberOfLines={2}>{text}</Text>}
            </View>
          ))}
        </View>
      )}

      <View style={s.divider} />
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={s.statLabel}>Cobertura</Text>
          <Text style={[s.statValue, { color: coverageColor }]}>
            {coverage == null ? '—' : `${coverage}%`}
          </Text>
        </View>
        <View style={[s.stat, { borderLeftWidth: 0.5, borderLeftColor: C.border.light }]}>
          <Text style={s.statLabel}>Vagas abertas</Text>
          <Text style={[s.statValue, openVacancies > 0 && { color: C.warning }]}>
            {openVacancies}
          </Text>
          {vacancyDays > 0 && (
            <Text style={s.statSub}>em {vacancyDays} {vacancyDays === 1 ? 'dia' : 'dias'}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const makeStyles = (C) => ({
  card: {
    backgroundColor: C.background.elevated,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: C.border.light,
    ...Shadows.small,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.secondary,
  },
  body: {
    gap: 6,
    marginBottom: 10,
  },
  instLine: {
    gap: 2,
  },
  instName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: C.text.primary,
  },
  groupNames: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
  },
  divider: {
    height: 0.5,
    backgroundColor: C.border.light,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    paddingLeft: 12,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.display,
    fontWeight: 'bold',
    color: C.text.primary,
    letterSpacing: -0.4,
  },
  statSub: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.text.tertiary,
    marginTop: 1,
  },
});

export default GroupSummaryCard;
