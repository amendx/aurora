/**
 * NotificationService — in-app inbox + OS push notifications.
 *
 * Inbox: Firestore-backed subscription to users/{uid}/notifications/.
 * Push: expo-notifications for device registration + Expo Push API for fan-out.
 *
 * expo-notifications is loaded lazily (require'd inside functions) so this
 * file can be imported even before the package is installed. Push features
 * become available the moment the package is present.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { db } from './firebase/config';
import FirebaseAdapter from './firebase/FirebaseAdapter';
import Logger from '../utils/Logger';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const DEFAULT_PREFS = {
  enabled: true,
  cededInMyGroups: true,
  swapProposalsToMe: true,
  myOfferOutcomes: true,
};

let _cachedExpoNotifications = undefined; // undefined = not yet attempted; null = failed to load
function _expoNotifs() {
  if (_cachedExpoNotifications !== undefined) return _cachedExpoNotifications;
  try {
    _cachedExpoNotifications = require('expo-notifications');
  } catch {
    _cachedExpoNotifications = null;
  }
  return _cachedExpoNotifications;
}

const NotificationService = {
  /**
   * Register the current device for push notifications and persist token
   * to users/{uid}/devices/{deviceId}. Safe no-op if expo-notifications is
   * not installed, the user declines, or running on web/simulator.
   */
  async registerForPushAsync(userId) {
    if (!userId) return null;
    const Notifications = _expoNotifs();
    if (!Notifications) {
      Logger.nav('push: expo-notifications not installed; skipping registration');
      return null;
    }
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Logger.nav('push: permission not granted');
        return null;
      }
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        null;
      if (!projectId) {
        Logger.nav('push: no EAS projectId configured; skipping push token registration');
        return null;
      }
      const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResp?.data;
      if (!token) return null;
      const deviceId = `${Platform.OS}_${token.slice(-12)}`;
      await FirebaseAdapter.savePushDevice(userId, deviceId, {
        token,
        platform: Platform.OS,
      });
      return token;
    } catch (err) {
      Logger.error(`[NotificationService] registerForPushAsync: ${err?.message}`);
      return null;
    }
  },

  /**
   * Subscribe to the inbox. cb receives Notification[] (newest first) on each change.
   * Returns an unsubscribe function.
   */
  subscribeInbox(userId, cb, max = 100) {
    if (!db || !userId) return () => {};
    try {
      const q = query(
        collection(db, 'users', String(userId), 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(max),
      );
      return onSnapshot(
        q,
        (snap) => {
          const items = [];
          snap.forEach(d => items.push({ id: d.id, ...d.data() }));
          cb(items);
        },
        (err) => Logger.error(`[NotificationService] inbox stream: ${err?.message}`),
      );
    } catch (err) {
      Logger.error(`[NotificationService] subscribeInbox: ${err?.message}`);
      return () => {};
    }
  },

  markRead(userId, notifId) {
    return FirebaseAdapter.markNotificationRead(userId, notifId);
  },

  async savePrefs(userId, prefs) {
    return FirebaseAdapter.saveNotificationPrefs(userId, { ...DEFAULT_PREFS, ...prefs });
  },

  async loadPrefs(userId) {
    const stored = await FirebaseAdapter.loadNotificationPrefs(userId);
    return { ...DEFAULT_PREFS, ...(stored || {}) };
  },

  defaultPrefs: () => ({ ...DEFAULT_PREFS }),

  /**
   * Send a notification to one user: writes inbox doc + fans out push (if opted in).
   * Returns the notification id written.
   */
  async notify(userId, type, { title, body, payload = {} } = {}) {
    if (!userId || !type) return null;
    const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const notif = { id, type, title: title || '', body: body || '', payload, read: false, createdAt: new Date().toISOString() };

    // 1. Write inbox entry (always)
    await FirebaseAdapter.writeNotification(userId, notif);

    // 2. Look up target's prefs and gate push fan-out
    const prefs = await NotificationService.loadPrefs(userId);
    if (!prefs.enabled) return id;
    const eventEnabledKey = {
      ceder_in_my_group:    'cededInMyGroups',
      ceder_offered_to_me:  'cededInMyGroups',   // share toggle with open-ceder for v1
      swap_proposed_to_me:  'swapProposalsToMe',
      offer_outcome:        'myOfferOutcomes',
    }[type];
    if (eventEnabledKey && !prefs[eventEnabledKey]) return id;

    // 3. Fan out push to all registered devices
    const devices = await FirebaseAdapter.loadPushDevices(userId);
    const tokens = devices.map(d => d.token).filter(t => typeof t === 'string' && t.startsWith('ExponentPushToken'));
    if (tokens.length === 0) return id;

    const messages = tokens.map(to => ({
      to,
      sound: 'default',
      title: notif.title,
      body: notif.body,
      data: { type, ...payload },
    }));

    try {
      await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    } catch (err) {
      Logger.error(`[NotificationService] push fan-out: ${err?.message}`);
    }
    return id;
  },
};

export default NotificationService;
