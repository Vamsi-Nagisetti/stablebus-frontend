import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens } from '@/features/auth/tokenStorage';
import { menuSignals } from '@/features/home/menuSignals';

/**
 * Profile menu. It is a normal screen (not a pop-up on Home), so the stack is
 *   Home -> Menu -> Bookings / Rewards / ...
 * and Back always goes one step: Bookings -> Menu -> Home.
 */

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
};

const PAGE_RGB = '248,244,237';
const HEADER_PHOTO = require('@/assets/scenic/night_lake.jpg'); // moonlit lake: this screen only

type Item = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route?: string };

// Add the route of each page when it exists. Items without a route show a calm "coming soon" message.
const MENU_ITEMS: Item[] = [
  { key: 'bookings', label: 'Bookings', icon: 'ticket-outline', route: '/bookings' },
  { key: 'rewards', label: 'Rewards', icon: 'gift-outline', route: '/rewards' },
  { key: 'passengers', label: 'Passengers', icon: 'people-outline', route: '/saved-passengers' },
  { key: 'rate', label: 'Rate app', icon: 'star-outline' },
  { key: 'help', label: 'Help', icon: 'help-circle-outline', route: '/help' },
  { key: 'settings', label: 'Account settings', icon: 'settings-outline', route: '/account-settings' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline', route: '/notifications' },
];

// Second list (open without logging in).
const LEGAL_ITEMS: Item[] = [
  { key: 'privacy', label: 'Privacy policy', icon: 'shield-checkmark-outline', route: '/privacy' },
  { key: 'terms', label: 'Terms & Conditions', icon: 'document-text-outline', route: '/terms' },
];

// These need a logged-in user.
const NEEDS_LOGIN = ['bookings', 'rewards', 'passengers', 'settings', 'notifications'];

/** Cover-fit photo with a focus point. */
function FocusImage({
  source,
  aspect,
  focusX,
  width,
  height,
}: {
  source: any;
  aspect: number;
  focusX: number;
  width: number;
  height: number;
}) {
  let w = height * aspect;
  let h = height;
  if (w < width) {
    w = width;
    h = width / aspect;
  }
  const left = -Math.min(Math.max(focusX * w - width / 2, 0), Math.max(w - width, 0));
  const top = -(h - height) / 2;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image source={source} style={{ width: w, height: h, marginLeft: left, marginTop: top }} resizeMode="cover" />
    </View>
  );
}

/** Soft fade from the page colour at the bottom edge, built from one SVG gradient. */
function BottomFade({ height }: { height: number }) {
  const stops = useMemo(() => {
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return Array.from({ length: 11 }, (_, i) => ({ offset: i / 10, opacity: smooth(i / 10) }));
  }, []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id="menu-fade" x1="0" y1="0" x2="0" y2="1">
            {stops.map(st => (
              <Stop key={st.offset} offset={st.offset} stopColor={`rgb(${PAGE_RGB})`} stopOpacity={st.opacity} />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#menu-fade)" />
      </Svg>
    </View>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [authed, setAuthed] = useState(false);

  // Calm, non-blocking message.
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, 3000);
    },
    [toastAnim]
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // Re-check the login every time the menu is in view (e.g. after logging out in Account settings).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getTokens()
        .then(tokens => alive && setAuthed(!!tokens))
        .catch(() => alive && setAuthed(false));
      return () => {
        alive = false;
      };
    }, [])
  );

  const askLogin = useCallback(() => {
    menuSignals.showWelcome = true; // Home shows the login screen when it is back in view
    router.back();
  }, [router]);

  const openItem = (item: Item) => {
    if (item.key === 'rate') {
      showToast('Thank you for supporting StableBus.');
      return;
    }
    if (!authed && NEEDS_LOGIN.includes(item.key)) {
      askLogin();
      return;
    }
    if (item.route) {
      router.push(item.route as any);
      return;
    }
    showToast(`${item.label} is coming soon.`);
  };

  const photoHeight = insets.top + 190;

  const renderRows = (items: Item[]) =>
    items.map((item, index) => (
      <Pressable
        key={item.key}
        style={[styles.row, index > 0 && styles.rowBorder]}
        onPress={() => openItem(item)}
        android_ripple={{ color: C.burgundyLight }}
      >
        <View style={styles.rowIcon}>
          <Ionicons name={item.icon} size={19} color={C.burgundy} />
        </View>
        <Text style={styles.rowLabel}>{item.label}</Text>
        <Ionicons name="chevron-forward" size={17} color={C.muted} />
      </Pressable>
    ));

  return (
    <View style={styles.root}>
      {/* Slides in from the left, like a menu */}
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_left' }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={{ height: photoHeight }}>
        <FocusImage source={HEADER_PHOTO} aspect={1000 / 563} focusX={0.42} width={width} height={photoHeight} />
        <BottomFade height={110} />
        <Pressable
          onPress={() => router.back()}
          style={[styles.close, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.who}>
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={26} color={C.burgundy} />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginTop: 38 }}>
          <Text style={styles.hello}>{authed ? 'Welcome back' : 'Hello, traveller'}</Text>
          {authed ? (
            <Text style={styles.sub}>Your trips and details</Text>
          ) : (
            <Pressable onPress={askLogin} hitSlop={8}>
              <Text style={styles.link}>Log in or sign up</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {renderRows(MENU_ITEMS)}
        <View style={styles.groupGap} />
        {renderRows(LEGAL_ITEMS)}
      </ScrollView>

      {!!toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastWrap,
            {
              top: insets.top + 10,
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            },
          ]}
        >
          <View style={styles.toast}>
            <View style={styles.toastIcon}>
              <Ionicons name="information" size={14} color="#fff" />
            </View>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  close: {
    position: 'absolute',
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(28, 14, 20, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  who: {
    marginTop: -32,
    paddingHorizontal: 20,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.burgundyLight,
    borderWidth: 3,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { color: C.ink, fontSize: 18, fontWeight: '500' },
  sub: { color: C.muted, fontSize: 13, marginTop: 3 },
  link: { color: C.burgundy, fontSize: 13.5, fontWeight: '500', marginTop: 3 },

  list: { paddingHorizontal: 20, paddingTop: 8 },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, color: C.ink, fontSize: 16 },
  groupGap: { height: 1, backgroundColor: C.border, marginTop: 14, marginBottom: 2 },

  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 50, elevation: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(56, 43, 40, 0.95)',
  },
  toastIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#A65372',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: { flexShrink: 1, color: '#fff', fontSize: 14 },
});