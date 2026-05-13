/**
 * GroupColorConfig — per-user custom color overrides for groups.
 *
 * Stored in AsyncStorage: aurora_grpcolors_{userId}
 * Mirrored to Firebase:   users/{userId}/settings/groupColors
 *
 * Shape: { colors: { [groupId]: "#hexcolor" }, updatedAt: ISO }
 *
 * Usage:
 *   const color = await getGroupColor(userId, groupId) ?? group.color ?? '#3b82f6';
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';

/** 8-color palette — simple, distinct, accessible */
export const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

const _key = (userId) => `aurora_grpcolors_${userId}`;

/**
 * Load all custom colors for a user.
 * @returns {Promise<{ [groupId]: string }>} — may be empty object
 */
export const getGroupColors = async (userId) => {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(_key(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.colors ?? {};
  } catch {
    return {};
  }
};

/**
 * Get the custom color for a single group, or null if not set.
 * @returns {Promise<string|null>}
 */
export const getGroupColor = async (userId, groupId) => {
  const all = await getGroupColors(userId);
  return all[String(groupId)] ?? null;
};

/**
 * Save a custom color for a group. Pass null to reset to API default.
 */
export const saveGroupColor = async (userId, groupId, color) => {
  if (!userId || !groupId) return;
  const all = await getGroupColors(userId);
  if (color === null) {
    delete all[String(groupId)];
  } else {
    all[String(groupId)] = color;
  }
  const payload = { colors: all, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(_key(userId), JSON.stringify(payload));
  FirebaseAdapter.saveGroupColors(userId, payload).catch(() => {});
};
