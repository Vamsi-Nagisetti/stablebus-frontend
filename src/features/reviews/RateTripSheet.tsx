import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reviewsApi } from './api';

const C = {
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  star: '#C18A43',
  danger: '#A34444',
};

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export type RateTarget = {
  bookingId: string;
  operator: string;
  route: string;
  date: string;
};

/** Quiet line for a completed trip. A Text link (not a Pressable) so it can sit inside the tappable booking card. */
export function RateRow({
  rating,
  rewardCoins,
  onPress,
}: {
  rating?: number;
  rewardCoins: number;
  onPress: () => void;
}) {
  if (rating) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowMuted}>You rated this trip</Text>
        <View style={styles.starsSmall}>
          {[1, 2, 3, 4, 5].map(n => (
            <Ionicons key={n} name={n <= rating ? 'star' : 'star-outline'} size={12} color={C.star} />
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowMuted}>How was your trip?</Text>
      <Text onPress={onPress} style={styles.rowLink} accessibilityRole="button">
        Rate{rewardCoins > 0 ? `  ·  Earn ${rewardCoins} coins` : ''}
      </Text>
    </View>
  );
}

export default function RateTripSheet({
  target,
  rewardCoins,
  onClose,
  onDone,
}: {
  target: RateTarget | null;
  rewardCoins: number;
  onClose: () => void;
  onDone: (bookingId: string, rating: number, coinsAwarded: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (target) {
      setRating(0);
      setComment('');
      setError('');
      setBusy(false);
    }
  }, [target?.bookingId]);

  const submit = async () => {
    if (!target || !rating || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await reviewsApi.submit(target.bookingId, rating, comment);
      onDone(target.bookingId, rating, result?.coins_awarded || 0);
    } catch (e: any) {
      if (e?.status === 409) {
        // Already rated (for example on another device): treat as done.
        onDone(target.bookingId, rating, 0);
        return;
      }
      setError(e?.message || 'Could not save your rating. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Rate your trip</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close" disabled={busy}>
              <Ionicons name="close" size={19} color={C.ink} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {target && (
              <View style={styles.tripBox}>
                <View style={styles.busIcon}>
                  <Ionicons name="bus-outline" size={20} color={C.burgundy} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.operator} numberOfLines={1}>{target.operator || 'Bus operator'}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{target.route}</Text>
                  <Text style={styles.meta}>{target.date}</Text>
                </View>
              </View>
            )}

            <Text style={styles.question}>How was your journey?</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                >
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={40} color={C.star} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>{rating ? LABELS[rating] : 'Tap a star'}</Text>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Tell others about the bus, driver and comfort (optional)"
              placeholderTextColor={C.muted}
              multiline
              maxLength={1000}
              style={styles.input}
              textAlignVertical="top"
            />

            {rewardCoins > 0 && (
              <View style={styles.reward}>
                <Image source={require('@/assets/scenic/coin_flat.png')} style={styles.coin} resizeMode="contain" />
                <Text style={styles.rewardText}>Rate this trip and earn {rewardCoins} coins.</Text>
              </View>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, (!rating || busy) && styles.buttonOff]}
              onPress={submit}
              disabled={!rating || busy}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit rating</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(56,43,40,0.38)' },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '700', color: C.ink },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4EFE8', alignItems: 'center', justifyContent: 'center' },

  tripBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FBF7F1',
    borderWidth: 1,
    borderColor: C.border,
  },
  busIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.burgundyLight, alignItems: 'center', justifyContent: 'center' },
  operator: { fontSize: 15, fontWeight: '700', color: C.ink },
  meta: { fontSize: 12.5, color: C.muted, marginTop: 2 },

  question: { fontSize: 16, fontWeight: '600', color: C.ink, textAlign: 'center', marginTop: 22 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 14 },
  label: { textAlign: 'center', marginTop: 8, fontSize: 14, color: C.burgundy, fontWeight: '600', minHeight: 20 },

  input: {
    marginTop: 18,
    minHeight: 96,
    maxHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: C.ink,
  },

  reward: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, justifyContent: 'center' },
  coin: { width: 22, height: 22 },
  rewardText: { fontSize: 13, color: C.muted },

  error: { marginTop: 12, textAlign: 'center', color: C.danger, fontSize: 13 },
  button: { marginTop: 18, height: 50, borderRadius: 25, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Quiet line used on completed trip cards
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  starsSmall: { flexDirection: 'row', gap: 2 },
  rowMuted: { fontSize: 12.5, color: C.muted },
  rowLink: { fontSize: 12.5, fontWeight: '600', color: C.burgundy, paddingVertical: 4, paddingLeft: 12 },
});