import React, { useMemo } from 'react';
import {
  Image,
  useWindowDimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// What will appear on this page once rewards are live. Edit freely.
const WILL_APPEAR: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; caption: string }[] = [
  { key: 'earned', icon: 'gift-outline', title: 'Rewards you’ve earned', caption: 'Thank-yous for the journeys you take with us.' },
  { key: 'offers', icon: 'pricetag-outline', title: 'Offers for your next trip', caption: 'Small things that make travel nicer.' },
  { key: 'soon', icon: 'time-outline', title: 'Ending soon', caption: 'A gentle reminder before anything expires.' },
];

/** Soft fade from the page colour at one edge, built from one SVG gradient. */
function EdgeFade({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const id = `rw-fade-${edge}`;
  const stops = useMemo(() => {
    const smooth = (t: number) => t * t * (3 - 2 * t);
    return Array.from({ length: 11 }, (_, i) => ({
      offset: i / 10,
      opacity: edge === 'top' ? 1 - smooth(i / 10) : smooth(i / 10),
    }));
  }, [edge]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map(st => (
              <Stop key={st.offset} offset={st.offset} stopColor={`rgb(${PAGE_RGB})`} stopOpacity={st.opacity} />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export default function RewardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The whole picture is shown (nothing cropped); its pale top sits under the status bar.
  const heroHeight = Math.round(width * (941 / 1671)) + 10;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* gift-box picture: the empty pastel corner holds the title, the bottom melts into the page */}
        <View style={{ height: heroHeight, backgroundColor: '#FCEDE4' }}>
          <Image
            source={require('@/assets/scenic/rewards_bg.jpg')}
            style={{ width, height: heroHeight }}
            resizeMode="cover"
          />
          <EdgeFade edge="bottom" height={Math.round(heroHeight * 0.3)} />

          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={20} color={C.ink} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Rewards</Text>
              <Text style={styles.subtitle}>A little something for every journey</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.heroTitle}>Your journeys deserve a little extra</Text>
          <Text style={styles.heroText}>
            We’re getting rewards ready for your StableBus journeys. Anything you’re eligible for will
            appear here.
          </Text>

          <View style={styles.notice}>
            <Ionicons name="sparkles-outline" size={18} color={C.burgundy} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>No rewards available yet</Text>
              <Text style={styles.noticeText}>Keep an eye on this space. We’ll let you know.</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>What you’ll find here</Text>
          <View style={styles.card}>
            {WILL_APPEAR.map((item, index) => (
              <View key={item.key}>
                {index > 0 && <View style={styles.hairline} />}
                <View style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={item.icon} size={19} color={C.burgundy} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowCaption}>{item.caption}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            Availability and eligibility will be shown here when the rewards programme launches.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,254,252,0.9)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { width: '44%' },
  title: { color: C.ink, fontSize: 20, fontWeight: '500' },
  subtitle: { color: C.muted, fontSize: 12.5, marginTop: 3 },

  body: { paddingHorizontal: 20, marginTop: 4, alignItems: 'center' },
  medallion: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#783D4A',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  heroTitle: {
    color: C.ink,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 300,
  },
  heroText: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    maxWidth: 320,
  },

  notice: {
    width: '100%',
    marginTop: 22,
    padding: 15,
    borderRadius: 18,
    backgroundColor: C.burgundyLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeTitle: { color: C.ink, fontSize: 14.5, fontWeight: '500' },
  noticeText: { color: C.muted, fontSize: 13, marginTop: 3 },

  sectionTitle: { alignSelf: 'flex-start', color: C.ink, fontSize: 16, fontWeight: '500', marginTop: 28, marginBottom: 11 },
  card: {
    width: '100%',
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 4,
  },
  hairline: { height: 1, backgroundColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 72, paddingVertical: 10 },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: C.ink, fontSize: 15 },
  rowCaption: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },

  footnote: {
    color: C.muted,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 22,
    paddingHorizontal: 12,
  },
});