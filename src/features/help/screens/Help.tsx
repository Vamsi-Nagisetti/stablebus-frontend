import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  light: '#F4EAEB',
};

const SUPPORT_PHONE = ''; // Add the official StableBus support number before release.
const SUPPORT_EMAIL = 'support@stablebus.com';

type Row = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: string; url: string; failMessage: string };

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Calm, non-blocking message (replaces Alert boxes).
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
      }, 3600);
    },
    [toastAnim]
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const rows: Row[] = [
    {
      key: 'call',
      icon: 'call-outline',
      label: 'Call us',
      value: SUPPORT_PHONE || 'Support number coming soon',
      url: SUPPORT_PHONE ? `tel:${SUPPORT_PHONE}` : '',
      failMessage: SUPPORT_PHONE
        ? `We couldn't start the call. You can reach us on ${SUPPORT_PHONE}.`
        : 'Our support number will be available soon. Please email us for now.',
    },
    {
      key: 'email',
      icon: 'mail-outline',
      label: 'Email us',
      value: SUPPORT_EMAIL,
      url: `mailto:${SUPPORT_EMAIL}`,
      failMessage: `We couldn't open your mail app. You can write to us at ${SUPPORT_EMAIL}.`,
    },
  ];

  const open = async (row: Row) => {
    if (!row.url) {
      showToast(row.failMessage);
      return;
    }
    try {
      await Linking.openURL(row.url);
    } catch {
      showToast(row.failMessage);
    }
  };

  return (
    <View style={styles.root}>
      {/* Shows over the page you came from (not a blank page), fading in */}
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <Pressable style={styles.scrim} onPress={() => router.back()} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.handle} />

        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Help & support</Text>
            <Text style={styles.subtitle}>We're here to help with your journey</Text>
          </View>
          <Pressable onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={C.ink} />
          </Pressable>
        </View>

        {rows.map(row => (
          <Pressable
            key={row.key}
            style={styles.row}
            onPress={() => open(row)}
            android_ripple={{ color: C.light }}
          >
            <View style={styles.icon}>
              <Ionicons name={row.icon} size={19} color={C.burgundy} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value} numberOfLines={1}>{row.value}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.muted} />
          </Pressable>
        ))}

        <Text style={styles.note}>
          Please keep your booking details handy when you contact us, so we can help you faster.
        </Text>
      </View>

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
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(40, 30, 28, 0.3)' },

  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { color: C.ink, fontSize: 19, fontWeight: '400' },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 3 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: C.ink, fontSize: 15, fontWeight: '500' },
  value: { color: C.muted, fontSize: 13, marginTop: 3 },
  note: { color: C.muted, fontSize: 12.5, lineHeight: 19, marginTop: 12 },

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