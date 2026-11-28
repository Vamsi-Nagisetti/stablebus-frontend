// Save as app/payment-result.tsx (same folder as tickets.tsx).
// Shown after a payment that did not end in a ticket: pending, failed or cancelled.
// A successful payment goes to the ticket screen as before.
import React, { useEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '@/features/feedback/feedback';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyDark: '#65313E',
  burgundyLight: '#F4EAEB',
  amber: '#9A6A22',
  amberLight: '#F8F0E1',
  red: '#B8453F',
  redLight: '#F9EAE8',
};

type Kind = 'pending' | 'failed' | 'cancelled';

const COPY: Record<Kind, { icon: keyof typeof Ionicons.glyphMap; title: string; tone: string; toneLight: string; message: string }> = {
  pending: {
    icon: 'time-outline',
    title: 'Confirming your payment',
    tone: C.amber,
    toneLight: C.amberLight,
    message:
      'We have not received the final status from your bank yet. Please do not pay again. If the payment goes through, your ticket is issued automatically and appears in Bookings. If it does not, any amount deducted is returned by your bank.',
  },
  failed: {
    icon: 'close-outline',
    title: 'Payment did not go through',
    tone: C.red,
    toneLight: C.redLight,
    message: 'If any money was deducted, your bank will return it automatically. You can try again.',
  },
  cancelled: {
    icon: 'remove-outline',
    title: 'Payment cancelled',
    tone: C.muted,
    toneLight: C.burgundyLight,
    message: 'No money was taken and your booking is not confirmed yet. You can try again while your seats are held.',
  },
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = value.includes('/')
    ? (() => {
        const [m, d, y] = value.split('/');
        return new Date(Number(y), Number(m) - 1, Number(d));
      })()
    : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function PaymentResult() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const rawKind = one(params.kind);
  const kind: Kind = rawKind === 'failed' || rawKind === 'cancelled' ? rawKind : 'pending';
  const copy = COPY[kind];
  const message = one(params.message) || copy.message;

  const from = one(params.from);
  const to = one(params.to);
  const date = formatDate(one(params.date));
  const busName = one(params.busName);
  const fareValue = Number(one(params.totalFare));
  const fare = Number.isFinite(fareValue) && fareValue > 0 ? `₹${fareValue.toLocaleString('en-IN')}` : '';
  const bookingRef = one(params.bookingId).slice(0, 8).toUpperCase();

  const goHome = () => router.replace('/' as any);

  // This is the end of checkout: going back (button, gesture or Android back) always lands on Home.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/' as any);
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  // One longer buzz: this screen is only shown when the payment did not end in a ticket.
  useEffect(() => {
    feedback.attention();
  }, []);

  const canRetry = kind !== 'pending' && router.canGoBack();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 64 + insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconRing, { backgroundColor: copy.toneLight }]}>
          <Ionicons name={copy.icon} size={40} color={copy.tone} />
        </View>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.message}>{message}</Text>

        {!!(from || to || fare) && (
          <View style={styles.card}>
            {!!(from || to) && (
              <Text style={styles.route} numberOfLines={2}>
                {from} → {to}
              </Text>
            )}
            {!!(date || busName) && (
              <Text style={styles.meta} numberOfLines={2}>
                {[date, busName].filter(Boolean).join(' · ')}
              </Text>
            )}
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Amount</Text>
              <Text style={styles.value}>{fare}</Text>
            </View>
            {!!bookingRef && (
              <View style={styles.row}>
                <Text style={styles.label}>Booking</Text>
                <Text style={styles.value}>{bookingRef}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: 14 + insets.bottom }]}>
        <Pressable onPress={goHome} style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
        {canRetry && (
          <Pressable onPress={() => router.back()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center' },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: { fontSize: 21, fontWeight: '600', color: C.ink, textAlign: 'center' },
  message: {
    marginTop: 10,
    fontSize: 14.5,
    lineHeight: 22,
    color: C.muted,
    textAlign: 'center',
    maxWidth: 340,
  },
  card: {
    alignSelf: 'stretch',
    marginTop: 28,
    backgroundColor: C.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
  },
  route: { fontSize: 15.5, fontWeight: '600', color: C.ink },
  meta: { marginTop: 4, fontSize: 13, color: C.muted },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  label: { fontSize: 13.5, color: C.muted },
  value: { fontSize: 13.5, fontWeight: '600', color: C.ink },
  bottom: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 8,
  },
  doneButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  retryButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: C.burgundy, fontSize: 14.5, fontWeight: '600' },
});