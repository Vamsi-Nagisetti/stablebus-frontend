import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { registerPush } from './push';

/**
 * Mount ONCE inside the component in app/_layout.tsx.
 *  - registers this phone when the app opens and the user is logged in (once, see push.ts)
 *  - opens a screen when a notification is tapped (the server can send data: { route: "/bookings" })
 */
export function usePushNotifications() {
  const router = useRouter();
  // The router object can change on every render; keep it in a ref so the effect below runs only once.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    registerPush();

    const open = (data: any) => {
      const route = data?.route;
      if (typeof route === 'string' && route.startsWith('/')) {
        routerRef.current.push(route as any);
      }
    };

    // App was closed and opened by tapping a notification
    Notifications.getLastNotificationResponseAsync()
      .then(response => open(response?.notification.request.content.data))
      .catch(() => undefined);

    // Tapped while the app is running / in the background
    const tapSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      open(response.notification.request.content.data);
    });

    // Expo can change the token: register again when it does
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      registerPush({ force: true });
    });

    return () => {
      tapSubscription.remove();
      tokenSubscription.remove();
    };
  }, []);
}