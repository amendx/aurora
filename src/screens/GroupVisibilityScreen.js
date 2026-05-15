/**
 * GroupVisibilityScreen — configure which groups appear in "Quem está também".
 *
 * Lists all groups the user belongs to. Each group can be toggled on/off.
 * The selection is saved in AsyncStorage via GroupVisibilityConfig.
 *
 * Default (first open): all groups are enabled.
 */

import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { useGroups } from '../contexts/GroupsContext';
import { getGroupVisibility, saveGroupVisibility } from '../utils/GroupVisibilityConfig';
import { getGroupColors } from '../utils/GroupColorConfig';
import TodayCoworkersService from '../services/TodayCoworkersService';
import { useColors, Typography, Spacing, Shadows, BorderRadius } from '../constants/DesignSystem';

const GroupVisibilityScreen = ({ navigation }) => {
  const { user, token } = useContext(AuthContext);
  const userId = user?.id;
  const { getUserGroups } = useGroups();
  const allGroups = getUserGroups(); // already sorted by name
  const C = useColors();
  const s = makeStyles(C);

  // { [groupId]: boolean } — true means shown in "Quem está também"
  const [enabled, setEnabled] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupColors, setGroupColors] = useState({});

  useEffect(() => {
    if (!userId) return;
    getGroupColors(userId).then(setGroupColors);
  }, [userId]);

  // Load persisted config on mount
  useEffect(() => {
    if (!userId) return;
    if (allGroups.length === 0) { setLoaded(true); return; }
    (async () => {
      const config = await getGroupVisibility(userId);
      const map = {};
      if (!config) {
        // No saved config → default: all groups enabled
        allGroups.forEach(g => { map[g.id] = true; });
      } else {
        const enabledSet = new Set(config.enabledGroupIds.map(String));
        allGroups.forEach(g => { map[g.id] = enabledSet.has(String(g.id)); });
      }
      setEnabled(map);
      setLoaded(true);
    })();
  }, [userId, allGroups.length]);

  const toggle = (groupId) => {
    setEnabled(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleSave = async () => {
    setSaving(true);
    // Keep IDs as strings — PlantaoAPI uses string IDs like "xZ-BNeGG_joK"
    const enabledIds = Object.entries(enabled)
      .filter(([, v]) => v)
      .map(([k]) => String(k));
    await saveGroupVisibility(userId, enabledIds);
    // Invalidate coworkers cache so "Quem está também" reflects new group selection
    TodayCoworkersService.clear();
    if (user?.source !== 'aurora') {
      TodayCoworkersService.compute(userId, token, userId).catch(() => {});
    }
    setSaving(false);
    navigation?.goBack();
  };

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <View style={s.container}>
      {/* Description */}
      <View style={s.descriptionCard}>
        <Ionicons name="people-outline" size={20} color={C.primary} />
        <Text style={s.descriptionText}>
          Escolha quais grupos aparecem na seção{' '}
          <Text style={s.descriptionBold}>Quem está também</Text>
          {' '}ao abrir um plantão.
        </Text>
      </View>

      {!loaded ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="small" color={C.primary} />
        </View>
      ) : allGroups.length === 0 ? (
        <View style={s.emptyContainer}>
          <Ionicons name="people-outline" size={40} color={C.text.tertiary} />
          <Text style={s.emptyText}>Nenhum grupo encontrado</Text>
          <Text style={s.emptySubtext}>
            Os grupos serão carregados automaticamente em breve
          </Text>
        </View>
      ) : (
        <ScrollView
          style={s.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
        >
          <Text style={s.sectionLabel}>SEUS GRUPOS - {enabledCount} de {allGroups.length} grupos ativos</Text>
          <View style={s.card}>
            {allGroups.map((group, index) => (
              <View key={group.id}>
                <Pressable
                  style={({ pressed }) => [
                    s.groupRow,
                    pressed && s.groupRowPressed,
                  ]}
                  onPress={() => toggle(group.id)}
                >
                  {/* Color dot */}
                  <View style={[s.groupDot, { backgroundColor: groupColors[String(group.id)] || group.color || C.primary }]} />

                  {/* Group info */}
                  <View style={s.groupInfo}>
                    <Text style={s.groupName} numberOfLines={1}>
                      {group.name}
                    </Text>
                    {group.institution?.name ? (
                      <Text style={s.groupInstitution} numberOfLines={1}>
                        {group.institution.name}
                      </Text>
                    ) : null}
                  </View>

                  {/* Toggle */}
                  <Switch
                    value={!!enabled[group.id]}
                    onValueChange={() => toggle(group.id)}
                    trackColor={{ false: C.border.medium, true: C.primary + '60' }}
                    thumbColor={enabled[group.id] ? C.primary : C.text.tertiary}
                  />
                </Pressable>
                {index < allGroups.length - 1 && (
                  <View style={s.separator} />
                )}
              </View>
            ))}
          </View>

          <Text style={s.footerNote}>
            Esta configuração afeta apenas a exibição de colegas em cada plantão. Não altera seus grupos ou cálculos.
          </Text>

          {/* Save button — inside scroll so it is never floating */}
          <Pressable
            style={({ pressed }) => [
              s.saveButton,
              pressed && s.saveButtonPressed,
              saving && s.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.saveButtonText}>Salvar configuração</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (C) => ({
  container: {
    flex: 1,
    backgroundColor: C.background.secondary,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: Spacing.md,
    backgroundColor: C.background.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border.light,
    ...Shadows.small,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },

  headerTitles: {
    flex: 1,
  },

  headerTitle: {
    fontSize: Typography.fontSize.title3,
    fontWeight: Typography.fontWeight.bold,
    color: C.text.primary,
  },

  headerSubtitle: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
    marginTop: 2,
  },

  descriptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    margin: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: C.primary + '10',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: C.primary + '25',
  },

  descriptionText: {
    flex: 1,
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
    lineHeight: Typography.fontSize.footnote * 1.5,
  },

  descriptionBold: {
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.primary,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },

  emptyText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.secondary,
  },

  emptySubtext: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.tertiary,
    textAlign: 'center',
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  sectionLabel: {
    fontSize: Typography.fontSize.caption1,
    fontWeight: Typography.fontWeight.semiBold,
    color: C.text.secondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  card: {
    backgroundColor: C.background.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },

  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 64,
  },

  groupRowPressed: {
    backgroundColor: C.background.secondary,
  },

  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
    flexShrink: 0,
  },

  groupInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },

  groupName: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.medium,
    color: C.text.primary,
    marginBottom: 2,
  },

  groupInstitution: {
    fontSize: Typography.fontSize.footnote,
    color: C.text.secondary,
  },

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border.light,
    marginLeft: Spacing.lg + 10 + Spacing.md, // align after dot
  },

  footerNote: {
    fontSize: Typography.fontSize.caption1,
    color: C.text.tertiary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    lineHeight: Typography.fontSize.caption1 * 1.5,
  },

  footer: { // kept for backward-compat but no longer rendered
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: C.background.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border.light,
  },

  saveButton: {
    backgroundColor: C.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md + 2,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonPressed: {
    opacity: 0.85,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    fontSize: Typography.fontSize.body,
    fontWeight: Typography.fontWeight.semiBold,
    color: '#fff',
  },
});

export default GroupVisibilityScreen;
