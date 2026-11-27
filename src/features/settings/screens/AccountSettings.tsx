import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearTokens } from '@/features/auth/tokenStorage';
import { unregisterPush } from '@/features/notifications/push';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  light: '#F4EAEB',
  danger: '#A34444',
  dangerLight: '#F8EDEC',
};

const SUPPORT_EMAIL = 'support@stablebus.com';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);

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
      }, 4200);
    },
    [toastAnim]
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Stop notifications for this phone first, while the login is still valid.
      await unregisterPush();
    } finally {
      await clearTokens();
      router.replace('/');
    }
  };

  const requestDeletion = () => {
    setConfirmLogout(false);
    showToast(`To delete your account, please write to ${SUPPORT_EMAIL}. Nothing has been submitted from the app.`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Account settings</Text>
          <Text style={styles.subtitle}>Manage your StableBus account</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section}>Account</Text>

        <View style={styles.card}>
          {!confirmLogout ? (
            <Pressable style={styles.row} onPress={() => setConfirmLogout(true)} android_ripple={{ color: C.light }}>
              <View style={styles.rowIcon}>
                <Ionicons name="log-out-outline" size={19} color={C.burgundy} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.label}>Log out</Text>
                <Text style={styles.desc}>Sign out of this device</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={C.muted} />
            </Pressable>
          ) : (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>Log out of StableBus?</Text>
              <Text style={styles.confirmText}>You'll stop getting notifications on this phone until you log in again.</Text>
              <View style={styles.confirmButtons}>
                <Pressable style={styles.stayButton} onPress={() => setConfirmLogout(false)} disabled={busy}>
                  <Text style={styles.stayText}>Stay logged in</Text>
                </Pressable>
                <Pressable style={[styles.logoutButton, busy && { opacity: 0.6 }]} onPress={logout} disabled={busy}>
                  <Text style={styles.logoutText}>{busy ? 'Logging out…' : 'Log out'}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.section, { marginTop: 26 }]}>Delete account</Text>

        <View style={styles.card}>
          <Pressable style={styles.row} onPress={requestDeletion} android_ripple={{ color: C.dangerLight }}>
            <View style={[styles.rowIcon, { backgroundColor: C.dangerLight }]}>
              <Ionicons name="trash-outline" size={19} color={C.danger} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.label, { color: C.danger }]}>Delete account</Text>
              <Text style={styles.desc}>Ask us to permanently delete your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.muted} />
          </Pressable>
        </View>

        <Text style={styles.foot}>
          Account deletion is handled by our support team. Write to {SUPPORT_EMAIL} and we'll take care of it.
        </Text>
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

  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '400', color: C.ink },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 3 },

  content: { paddingHorizontal: 16, paddingTop: 12 },
  section: { fontSize: 13, color: C.muted, marginBottom: 10, marginLeft: 4 },

  card: {
    backgroundColor: C.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    shadowColor: '#783D4A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.light, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '500', color: C.ink },
  desc: { fontSize: 13, color: C.muted, marginTop: 3 },
  foot: { fontSize: 12.5, color: C.muted, lineHeight: 19, marginTop: 14, paddingHorizontal: 4 },

  confirm: { paddingVertical: 18 },
  confirmTitle: { fontSize: 16, fontWeight: '500', color: C.ink },
  confirmText: { fontSize: 13.5, lineHeight: 20, color: C.muted, marginTop: 6 },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stayButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stayText: { fontSize: 14, color: C.burgundy },
  logoutButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '500', color: '#fff' },

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
  toastIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#A65372', alignItems: 'center', justifyContent: 'center' },
  toastText: { flexShrink: 1, color: '#fff', fontSize: 14 },
});