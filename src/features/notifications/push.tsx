import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { getTokens } from '@/features/auth/tokenStorage';
import { registerDevice, unregisterDevice } from './api';

/**
 * Push notifications for StableBus.
 *   registerPush()   - after login, and every app start while logged in. Safe to call often: the server is
 *                      only contacted the first time, or when the Expo token changes.
 *   unregisterPush() - on logout, BEFORE the login tokens are cleared.
 * Neither function ever throws, so a notification problem can never break login or logout.
 */

const SAVED_TOKEN_KEY = 'stablebus_registered_push_token';

// Show notifications (banner + sound) while the app is open too. (Not used on web.)
if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Set to true ONLY after you have rebuilt the app with the stablebus_pop.wav sound included
// (the "sounds" entry of the expo-notifications plugin in app.json). On an older build the sound does
// not exist and Android reports an error. Android also cannot change a channel's sound after the
// channel is created, so the "stablebus" channel is created only when this is true.
const CUSTOM_SOUND_READY = false;

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'StableBus',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#783D4A',
  });
  if (!CUSTOM_SOUND_READY) return;
  await Notifications.setNotificationChannelAsync('stablebus', {
    name: 'Booking updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'stablebus_pop.wav',
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#783D4A',
  });
}

/** Asks for permission (once) and returns this device's Expo push token, or null. */
async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Notifications need a real phone (not an emulator).');
    return null;
  }

  await setupAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    console.log('[Push] Notification permission was not granted.');
    return null;
  }

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  if (!projectId) {
    console.warn('[Push] No EAS projectId found. Run "eas init" (see setup steps).');
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data || null;
}

let inFlight: Promise<void> | null = null;
let lastFailureAt = 0;
let doneThisSession = false;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

/**
 * Safe to call from anywhere, any number of times:
 *  - calls made while a registration is running share that one run
 *  - after success it does nothing more until the app restarts (or the Expo token changes)
 *  - after a failure it waits 5 minutes before trying again, so a server problem never causes a loop
 */
export function registerPush(options: { force?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (inFlight) return inFlight;
  if (doneThisSession && !options.force) return Promise.resolve();
  if (!options.force && Date.now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) return Promise.resolve();

  inFlight = (async () => {
    try {
      const tokens = await getTokens();
      if (!tokens) return; // not logged in

      const expoToken = await getExpoPushToken();
      if (!expoToken) return;

      const saved = await SecureStore.getItemAsync(SAVED_TOKEN_KEY);
      if (saved === expoToken) {
        doneThisSession = true; // already registered with the server
        return;
      }

      await registerDevice({
        expo_push_token: expoToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        device_name: Device.deviceName || Device.modelName || `${Platform.OS} phone`,
      });
      await SecureStore.setItemAsync(SAVED_TOKEN_KEY, expoToken);
      doneThisSession = true;
      console.log('[Push] Device registered.');
    } catch (error: any) {
      lastFailureAt = Date.now();
      console.warn('[Push] Registration failed (will retry in 5 minutes):', error?.message || error);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function unregisterPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const saved = await SecureStore.getItemAsync(SAVED_TOKEN_KEY);
    if (!saved) return;
    await unregisterDevice(saved);
    await SecureStore.deleteItemAsync(SAVED_TOKEN_KEY);
    doneThisSession = false;
    lastFailureAt = 0;
    console.log('[Push] Device unregistered.');
  } catch (error: any) {
    console.warn('[Push] Unregister failed:', error?.message || error);
    // Forget it locally anyway, so the next login registers again.
    SecureStore.deleteItemAsync(SAVED_TOKEN_KEY).catch(() => undefined);
    doneThisSession = false;
    lastFailureAt = 0;
  }
}