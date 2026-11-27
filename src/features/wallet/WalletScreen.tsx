import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '@/services/http';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
};

const PANEL = '#FDE8DE';
const BG_RGB = '248,244,237';

const COIN = require('@/assets/scenic/coin.png');
const SCENIC_BG = require('@/assets/scenic/scenic_bg.jpg');
const BURGUNDY_RGB = '95,45,58';

type Wallet = {
  coins: number;
  rupee_value: string;
  next_expiry?: { coins: number; expires_at: string } | null;
  trips?: { total_completed: number; last_30_days: number };
  lifetime_coins?: number;
  savings_rupees?: string;
};

type Way = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption: string;
  image: ImageSourcePropType;
  aspect: number; // width / height of the picture
  focusX: number; // 0..1, which part of the picture stays in view
  focusY: number;
};

const WAYS: Way[] = [
  {
    key: 'meet',
    icon: 'people-outline',
    title: 'Meet new people',
    caption: 'Every journey starts with new faces, and every trip you complete fills your wallet with coins.',
    image: require('@/assets/scenic/story_friends.jpg'),
    aspect: 1672 / 941,
    focusX: 0.5,
    focusY: 0.5,
  },
  {
    key: 'experience',
    icon: 'compass-outline',
    title: 'Gain experiences',
    caption: 'Each road adds a story. The more you travel, the more coins you collect.',
    image: require('@/assets/scenic/story_hiker.jpg'),
    aspect: 1672 / 941,
    focusX: 0.3,
    focusY: 0.5,
  },
  {
    key: 'grow',
    icon: 'wallet-outline',
    title: 'Watch your coins grow',
    caption: 'They stay with you till 1 January, and come back to you if a plan changes.',
    image: require('@/assets/scenic/story_wanderer.jpg'),
    aspect: 1536 / 1024,
    focusX: 0.2,
    focusY: 0.5,
  },
  {
    key: 'again',
    icon: 'bus-outline',
    title: 'Travel again, for less',
    caption: 'Spend them on your next ticket, in full or in part, and the story carries on.',
    image: require('@/assets/scenic/story_family.jpg'),
    aspect: 1536 / 1024,
    focusX: 0.45,
    focusY: 0.5,
  },
];

const TILE_H = 250;

const dayLabel = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const rupees = (value?: string) => `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;

/** Soft vertical fade; the colour is solid at `from` and melts to transparent. */
function EdgeFade({
  id,
  rgb,
  height,
  from,
  solid = 0,
}: {
  id: string;
  rgb: string;
  height: number;
  from: 'top' | 'bottom';
  solid?: number;
}) {
  const stops = useMemo(() => {
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      const k = t <= solid ? 0 : (t - solid) / (1 - solid);
      return { offset: t, opacity: 1 - smooth(k) };
    });
  }, [solid]);
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, right: 0, height }, from === 'top' ? { top: 0 } : { bottom: 0 }]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1={from === 'top' ? '0' : '1'} x2="0" y2={from === 'top' ? '1' : '0'}>
            {stops.map(st => (
              <Stop key={st.offset} offset={st.offset} stopColor={`rgb(${rgb})`} stopOpacity={st.opacity} />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A little trail of dots and a coin that joins one scene to the next. */
function CoinTrail() {
  return (
    <View style={styles.trail}>
      <View style={styles.trailDot} />
      <Image source={COIN} style={styles.trailCoin} resizeMode="contain" />
      <View style={styles.trailDot} />
    </View>
  );
}

/** A picture cropped to the box like resizeMode cover, but keeping the chosen focus point in view. */
function FocusImage({
  source,
  aspect,
  width,
  height,
  focusX,
  focusY,
}: {
  source: ImageSourcePropType;
  aspect: number;
  width: number;
  height: number;
  focusX: number;
  focusY: number;
}) {
  const scale = Math.max(width / aspect, height);
  const w = scale * aspect;
  const h = scale;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image
        source={source}
        style={{ width: w, height: h, marginLeft: -(w - width) * focusX, marginTop: -(h - height) * focusY }}
      />
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const storyWidth = Math.min(width, 680) - 32;
  const [storyH, setStoryH] = useState(900);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // One request is all this page needs.
  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setWallet(await request<Wallet>('/api/v1/wallet', { timeoutMs: 20000 }));
    } catch (e: any) {
      setError(e?.message || 'Unable to load your wallet right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const expiry = wallet?.next_expiry;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={PANEL} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.burgundy} />
        }
      >
        {/* HERO: the coin, your balance, and a peach that melts into the page */}
        <View style={styles.hero}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + 10 }]}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={C.ink} />
          </Pressable>

          <View style={[styles.heroInner, { paddingTop: insets.top + 54 }]}>
            {loading ? (
              <ActivityIndicator color={C.burgundy} style={{ marginVertical: 40 }} />
            ) : error ? (
              <View style={styles.errorBox}>
                <Ionicons name="cloud-offline-outline" size={19} color={C.burgundy} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => load()} hitSlop={8}>
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.youHave}>You have</Text>
                <View style={styles.balanceRow}>
                  <Image source={require('@/assets/scenic/coin_flat.png')} style={styles.balanceCoin} resizeMode="contain" />
                  <Text style={styles.balance}>{(wallet?.coins ?? 0).toLocaleString('en-IN')}</Text>
                  <Text style={styles.balanceUnit}>coins</Text>
                </View>
                <Text style={styles.worth}>worth {rupees(wallet?.rupee_value)}</Text>
                {!!expiry && (
                  <View style={styles.expiryPill}>
                    <Ionicons name="time-outline" size={14} color={C.muted} />
                    <Text style={styles.expiryText}>
                      {expiry.coins.toLocaleString('en-IN')} coins expire on {dayLabel(expiry.expires_at)}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
          <EdgeFade id="wallet-hero-bottom" rgb={BG_RGB} height={120} from="bottom" solid={0.1} />
        </View>

        {/* STATS */}
        {!loading && !error && (
          <View style={styles.statsCard}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{(wallet?.lifetime_coins ?? 0).toLocaleString('en-IN')}</Text>
              <Text style={styles.statLabel}>Lifetime coins</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{rupees(wallet?.savings_rupees)}</Text>
              <Text style={styles.statLabel}>Trip savings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{wallet?.trips?.total_completed ?? 0}</Text>
              <Text style={styles.statLabel}>Trips completed</Text>
            </View>
          </View>
        )}

        {/* SCENIC STORY: same backdrop as Home; each picture melts into its own caption */}
        <View style={styles.story} onLayout={e => setStoryH(e.nativeEvent.layout.height)}>
          <Image source={SCENIC_BG} style={[styles.storyBg, { height: storyH }]} resizeMode="cover" />
          <EdgeFade id="wallet-story-top" rgb={BG_RGB} height={150} from="top" />
          <EdgeFade id="wallet-story-bottom" rgb={BG_RGB} height={170} from="bottom" />

          <View style={styles.storyInner}>
            <View style={styles.storyHeading}>
              <Text style={styles.sectionTitle}>Where your coins work</Text>
              <Text style={styles.sectionSubtitle}>One journey leads to the next</Text>
            </View>

            {WAYS.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && <CoinTrail />}
              <View style={styles.tile}>
                <FocusImage
                  source={item.image}
                  aspect={item.aspect}
                  width={storyWidth}
                  height={TILE_H}
                  focusX={item.focusX}
                  focusY={item.focusY}
                />
                <EdgeFade id={`wallet-tile-${item.key}`} rgb={BURGUNDY_RGB} height={140} from="bottom" solid={0.3} />
                <View style={styles.tileText}>
                  <View style={styles.tileTitleRow}>
                    <Ionicons name={item.icon} size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.tileTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.tileCaption}>{item.caption}</Text>
                </View>
              </View>
              </React.Fragment>
            ))}

            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                4 coins = ₹1. Coins are added once a trip is completed, and the coins for each trip show under My
                bookings.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  hero: { backgroundColor: PANEL, overflow: 'hidden' },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,254,252,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInner: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 52, minHeight: 210 },
  youHave: { color: C.muted, fontSize: 13.5 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  balanceCoin: { width: 26, height: 26 },
  balance: { color: C.burgundy, fontSize: 32, fontWeight: '500', letterSpacing: -0.5 },
  balanceUnit: { color: C.muted, fontSize: 15, fontWeight: '400' },
  worth: { color: C.muted, fontSize: 14.5 },
  expiryPill: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255,254,252,0.7)',
  },
  expiryText: { color: C.muted, fontSize: 12.5 },

  errorBox: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  errorText: { color: C.muted, fontSize: 13.5, textAlign: 'center' },
  retry: { color: C.burgundy, fontSize: 14, fontWeight: '600' },

  statsCard: {
    marginHorizontal: 22,
    marginTop: -34,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,254,252,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(234,224,215,0.7)',
    shadowColor: '#783D4A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    zIndex: 2,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { color: C.burgundy, fontSize: 19, fontWeight: '600' },
  statLabel: { color: C.muted, fontSize: 11.5, marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: C.border },

  story: { marginTop: 14, overflow: 'hidden', backgroundColor: C.bg },
  storyBg: { position: 'absolute', left: 0, right: 0, top: 0, width: '100%' },
  storyInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 90,
  },
  storyHeading: { paddingHorizontal: 6, marginBottom: 18 },
  sectionTitle: { color: C.ink, fontSize: 20, fontWeight: '500' },
  sectionSubtitle: { color: C.muted, fontSize: 13.5, marginTop: 4 },

  tile: {
    height: TILE_H,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#5F2D3A',
    shadowColor: '#4B2430',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  tileText: { position: 'absolute', left: 20, right: 20, bottom: 18 },
  trail: { alignItems: 'center', justifyContent: 'center', height: 56, gap: 4 },
  trailDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(120,61,74,0.35)' },
  trailCoin: { width: 22, height: 22 },
  tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '500', letterSpacing: 0.1 },
  tileCaption: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18, marginTop: 3 },

  noteCard: {
    marginTop: 22,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,254,252,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(234,224,215,0.8)',
  },
  noteText: { color: '#6F625C', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
});