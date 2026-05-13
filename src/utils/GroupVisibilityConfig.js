/**
 * GroupVisibilityConfig — persists which groups are included in "Quem está também".
 *
 * Local storage : AsyncStorage key `aurora_grpvis_{userId}`
 * Firebase path : users/{userId}/settings/groupVisibility
 *
 * Default (no saved config): all groups enabled (callers treat null as "all").
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseAdapter from '../services/firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const _key = (userId) => `aurora_grpvis_${userId}`;

/**
 * Load the group visibility config for a user.
 * Returns { enabledGroupIds: string[] } or null when no config has been saved yet.
 */
export const getGroupVisibility = async (userId) => {
  try {
    const raw = await AsyncStorage.getItem(_key(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Persist the list of enabled group IDs.
 * IDs are kept as strings (they are string IDs from PlantaoAPI API).
 * Writes locally first (always), then to Firebase (fire-and-forget).
 *
 * @param {string|number} userId
 * @param {string[]} enabledGroupIds   — string IDs, NOT converted to Number
 */
export const saveGroupVisibility = async (userId, enabledGroupIds) => {
  const config = {
    enabledGroupIds,            // string[] — preserved as-is
    updatedAt: new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(_key(userId), JSON.stringify(config));
    Logger.debug(`[GroupVisibility] Saved locally: ${enabledGroupIds.length} groups enabled`);
  } catch (err) {
    Logger.warn(`[GroupVisibility] Local save failed: ${err?.message}`);
  }
  // Firebase shadow write (fire-and-forget)
  FirebaseAdapter.saveGroupVisibilityConfig(userId, config).catch(() => {});
};
