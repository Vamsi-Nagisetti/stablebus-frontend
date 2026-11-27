import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendOTP, verifyOTP } from '@/features/auth/api';
import { saveTokens, getTokens, clearTokens } from '@/features/auth/tokenStorage';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { searchApi } from '@/features/search/api';
import type { City } from '@/types/api';
import { menuSignals } from '@/features/home/menuSignals';
import { registerPush } from '@/features/notifications/push';
import { setSearchResponse } from '@/features/search/resultsCache';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyDark: '#65313E',
  burgundyLight: '#F4EAEB',
  hero: '#70404A',
  white: '#FFFFFF',
};

type CityField = 'from' | 'to';
const HOME_PREFS_KEY = 'stablebus_home_preferences';

async function readHomePreferences(): Promise<any | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof localStorage !== 'undefined' ? localStorage.getItem(HOME_PREFS_KEY) : null)
      : await SecureStore.getItemAsync(HOME_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function writeHomePreferences(value: any): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HOME_PREFS_KEY, raw);
    } else {
      await SecureStore.setItemAsync(HOME_PREFS_KEY, raw);
    }
  } catch (error) {
    console.warn('[StableBus Home] Preference save failed:', error);
  }
}

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateInfo = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-IN', { month: 'short' }),
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short' }),
  };
};

const cityIcon = (name: string): keyof typeof Ionicons.glyphMap => {
  const value = name.toLowerCase();

  if (value.includes('hyderabad')) return 'business-outline';
  if (value.includes('bengaluru') || value.includes('bangalore')) return 'leaf-outline';
  if (value.includes('vijayawada')) return 'water-outline';
  if (value.includes('chennai')) return 'sunny-outline';
  if (value.includes('tirupati')) return 'trail-sign-outline';
  if (value.includes('nellore')) return 'water-outline';
  if (value.includes('guntur')) return 'flower-outline';
  if (value.includes('mumbai')) return 'boat-outline';

  return 'location-outline';
};

/* ------------------------------------------------------------------ */
/* Photos: copy the files from scenic_images.zip into assets/scenic/.  */
/* ------------------------------------------------------------------ */
const IMAGES = {
  sunset: require('@/assets/scenic/sunset.jpg'),
  tirupati: require('@/assets/scenic/tirupati.jpg'),
  kerala: require('@/assets/scenic/kerala.jpg'),
  ghats: require('@/assets/scenic/ghats.jpg'),
  andhra: require('@/assets/scenic/andhra.jpg'),
  scenicBg: require('@/assets/scenic/scenic_bg.jpg'),
  hero: require('@/assets/scenic/hero_bg.jpg'),
  icon: require('@/assets/scenic/icon_ticket.png'),
  nightLake: require('@/assets/scenic/night_lake.jpg'), // profile menu header only
  sketchReveal: require('@/assets/scenic/sketch_reveal.webp'), // loading animation 1 (draws itself)
  sketchBridge: require('@/assets/scenic/sketch_bridge.webp'), // loading animation 2
};

// Scenes that softly fade in and out while buses are being searched.
// The loading sketches play one after the other (1, 2, 1, 2, ...) while buses are being searched.
const SKETCH_ASPECT = 473 / 840; // height / width of the animation files
const SKETCH_SWITCH_MS = 9500; // each sketch draws itself in ~9 s, rests a moment, then the next one takes over
const SKETCH_BLEND_MS = 700;
const LOAD_SKETCHES = [IMAGES.sketchReveal, IMAGES.sketchBridge];

// Replace with your real pages.
const TERMS_URL = 'https://stablebus.com/terms';
const PRIVACY_URL = 'https://stablebus.com/privacy';

// Scenic cards: the app looks the cities up by name in the city list from the API.
// If a name is not in your list the card shows a calm "not available" message.
const SCENIC_ROUTES = [
  { key: 'tirupati', title: 'Bengaluru → Tirupati', caption: 'Temple hills at sunrise', from: ['Bengaluru', 'Bangalore'], to: ['Tirupati'], image: IMAGES.tirupati },
  { key: 'kerala', title: 'Bengaluru → Kerala', caption: 'Backwaters and palm-lined roads', from: ['Bengaluru', 'Bangalore'], to: ['Kochi', 'Cochin', 'Ernakulam', 'Kerala'], image: IMAGES.kerala },
  { key: 'ghats', title: 'Bengaluru → Goa', caption: 'Misty ghats and waterfalls', from: ['Bengaluru', 'Bangalore'], to: ['Goa', 'Panaji', 'Panjim', 'Madgaon', 'Margao'], image: IMAGES.ghats },
  { key: 'andhra', title: 'Hyderabad → Vijayawada', caption: 'Green fields, golden hours', from: ['Hyderabad'], to: ['Vijayawada'], image: IMAGES.andhra },
];

// OFFERS: add, edit or remove entries. Leave the list empty to hide the Offers block.
// code      -> optional; tapping the card copies it
// route     -> optional; tapping the card opens this page
// These three are SAMPLE entries so you can see the layout: replace them with your real offers.
const OFFERS: { key: string; title: string; caption: string; code?: string; icon: keyof typeof Ionicons.glyphMap; route?: string }[] = [
  { key: 'first', title: 'Your first trip', caption: 'A small thank-you on your first booking', code: 'WELCOME', icon: 'gift-outline' },
  { key: 'weekend', title: 'Weekend getaways', caption: 'Plan ahead and travel lighter', code: 'WEEKEND', icon: 'sunny-outline' },
  { key: 'friends', title: 'Travelling together', caption: 'Book more seats, enjoy the journey', icon: 'people-outline' },
];

const FOOTER_LINKS: { key: string; label: string; url?: string }[] = [
  { key: 'help', label: 'Help & support' },
  { key: 'terms', label: 'Terms', url: TERMS_URL },
  { key: 'privacy', label: 'Privacy', url: PRIVACY_URL },
  { key: 'agreement', label: 'User Agreement', url: 'https://stablebus.com/user-agreement' },
];

const POPULAR_ROUTES: [string, string][] = [
  ['Bengaluru', 'Hyderabad'],
  ['Bengaluru', 'Chennai'],
  ['Hyderabad', 'Vijayawada'],
  ['Bengaluru', 'Tirupati'],
  ['Hyderabad', 'Bengaluru'],
  ['Vijayawada', 'Hyderabad'],
];

const MOBILE_RE = /^[6-9]\d{9}$/;
// Soft fade at the bottom of the welcome photo (no hard black band).
const SCRIM = [0, 0.03, 0.08, 0.16, 0.28, 0.42, 0.56, 0.68, 0.78, 0.84];
const SCENIC_ON_HOME = 3;
const OFFER_W = 268;

// Page colour as rgb, used for the soft fades where photos melt into the page.
const PAGE_RGB = '248,244,237';

// The welcome screen is shown once per app open; "Skip" keeps it away until the app is reopened.
let welcomeDismissed = false;

/** Spelling-tolerant city name: "Tirupathi" = "Tirupati", "Bangalore" = "Bengaluru", "(AP)" suffixes ignored. */
function normalizeCity(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/th/g, 't')
    .replace(/^bangalore$/, 'bengaluru')
    .replace(/^bangaluru$/, 'bengaluru')
    .replace(/^bengalore$/, 'bengaluru');
}

function findCity(cities: City[], names: string[]): City | undefined {
  const wanted = names.map(normalizeCity).filter(Boolean);
  const indexed = cities.map(c => ({ city: c, key: normalizeCity(c.cityName) }));
  return (
    indexed.find(x => wanted.includes(x.key))?.city ||
    indexed.find(x => wanted.some(n => x.key.startsWith(n) || n.startsWith(x.key)))?.city ||
    indexed.find(x => wanted.some(n => x.key.includes(n)))?.city
  );
}

function relativeDay(value: string): string {
  const target = new Date(`${value}T00:00:00`);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  return '';
}

/* ---------------- City picker (own component: typing never re-renders the whole Home page) ---------------- */
const CityRow = React.memo(function CityRow({ city, onPick }: { city: City; onPick: (city: City) => void }) {
  return (
    <Pressable style={s.cityOption} onPress={() => onPick(city)}>
      <View style={s.optionIcon}>
        <Ionicons name="location-outline" size={17} color={C.burgundy} />
      </View>
      <Text style={s.optionName}>{city.cityName}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.muted} />
    </Pressable>
  );
});

const CityPickerModal = React.memo(function CityPickerModal({
  field,
  cities,
  loading,
  topInset,
  bottomInset,
  onPick,
  onClose,
}: {
  field: CityField | null;
  cities: City[];
  loading: boolean;
  topInset: number;
  bottomInset: number;
  onPick: (city: City) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Start empty on every open; open the keyboard only after the slide-in has finished.
  useEffect(() => {
    if (!field) {
      setQuery('');
      setReady(false);
    }
  }, [field]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const list = value ? cities.filter(c => c.cityName.toLowerCase().includes(value)) : cities;
    return list.slice(0, 100);
  }, [cities, query]);

  const renderItem = useCallback(({ item }: { item: City }) => <CityRow city={item} onPick={onPick} />, [onPick]);
  const keyExtractor = useCallback((c: City) => `${c.cityID}-${c.cityName}`, []);

  return (
    <Modal
      visible={!!field}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        setReady(true);
        setTimeout(() => inputRef.current?.focus(), 120);
      }}
    >
      <View style={[s.fullScreenPicker, { paddingTop: topInset + 10, paddingBottom: bottomInset }]}>
        <View style={s.fullScreenPickerHeader}>
          <Pressable style={s.closeButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={20} color={C.ink} />
          </Pressable>
          <View style={s.pickerTitleWrap}>
            <Text style={s.modalTitle}>Select {field === 'from' ? 'departure' : 'destination'} city</Text>
            <Text style={s.modalSubtitle}>Choose your travel city</Text>
          </View>
        </View>
        <View style={s.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={C.muted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search city"
            placeholderTextColor="#A99B94"
            style={s.searchInput}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </Pressable>
          )}
        </View>
        {loading ? (
          <View style={s.pickerLoading}>
            <ActivityIndicator color={C.burgundy} size="large" />
            <Text style={s.pickerLoadingText}>Loading cities…</Text>
          </View>
        ) : (
          <FlatList
            data={ready ? filtered : filtered.slice(0, 12)}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            style={s.cityList}
            contentContainerStyle={s.fullScreenCityList}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            removeClippedSubviews
            ListEmptyComponent={<Text style={s.emptyText}>No cities found.</Text>}
          />
        )}
      </View>
    </Modal>
  );
});

/**
 * Bus-search memory. A search that was started early (see the prefetch effect in Home) or recently
 * finished is reused, so tapping "Search buses" can open Results instantly.
 */
const SEARCH_TTL_MS = 120000;
const searchStore = new Map<string, { at: number; data?: any; promise?: Promise<any> }>();

function fetchBuses(params: { from_city: string; to_city: string; travel_date: string }): Promise<any> {
  const key = `${params.from_city}|${params.to_city}|${params.travel_date}`;
  const hit = searchStore.get(key);
  if (hit) {
    if (hit.data && Date.now() - hit.at < SEARCH_TTL_MS) return Promise.resolve(hit.data);
    if (hit.promise) return hit.promise;
  }
  if (searchStore.size > 12) {
    const oldest = [...searchStore.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) searchStore.delete(oldest[0]);
  }
  const promise = withRetry(() => searchApi.buses(params))
    .then(data => {
      searchStore.set(key, { at: Date.now(), data });
      return data;
    })
    .catch(error => {
      searchStore.delete(key);
      throw error;
    });
  searchStore.set(key, { at: Date.now(), promise });
  return promise;
}

/** Runs a read-only request again once if the connection was cancelled or timed out. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.isCancelled || e?.isTimeout || /cancel|abort|interrupted|taking longer/i.test(String(e?.message))) {
      await new Promise(resolve => setTimeout(resolve, 700));
      return fn();
    }
    throw e;
  }
}

function friendlyError(error: any, fallback: string): string {
  const raw = error?.message;
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) return fallback;
  return raw;
}

/** Top edge of the keyboard in screen coordinates (null while it is hidden). */
function useKeyboardTop(): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setTop(e.endCoordinates?.screenY ?? null)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setTop(null)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return top;
}

/** How much of a full-screen container the keyboard really covers (0 if Android already resized). */
function useKeyboardOverlap(ref: React.RefObject<View | null>, keyboardTop: number | null) {
  const [frame, setFrame] = useState({ y: 0, h: 0 });
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      setFrame(f => (Math.abs(f.y - y) < 1 && Math.abs(f.h - h) < 1 ? f : { y, h }));
    });
  }, [ref]);
  useEffect(() => {
    measure();
    const t = setTimeout(measure, 150);
    return () => clearTimeout(t);
  }, [keyboardTop, measure]);
  const overlap = keyboardTop == null ? 0 : Math.max(0, Math.round(frame.y + frame.h - keyboardTop));
  return { overlap, measure };
}

/** Cover-fit photo with a focus point, so the bus stays in view on tall phone screens. */
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

function openLink(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * Smooth fade from the page colour (at the edge) to transparent.
 * Built from overlapping layers (no hard stripes, no seams) so it works without a gradient library.
 */
function EdgeFade({
  edge,
  height,
  rgb = PAGE_RGB,
}: {
  edge: 'top' | 'bottom';
  height: number;
  rgb?: string;
}) {
  // One SVG gradient instead of dozens of stacked translucent views (much lighter to draw).
  const id = `edgefade-${edge}-${rgb.replace(/,/g, '-')}`;
  const stops = useMemo(() => {
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const n = 10;
    const list: { offset: number; opacity: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // the solid edge is at offset 0 for the top fade and at offset 1 for the bottom fade
      list.push({ offset: t, opacity: edge === 'top' ? 1 - smooth(t) : smooth(t) });
    }
    return list;
  }, [edge]);
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
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

/**
 * Loading sketches: each one draws itself line by line and fills with colour. They play in order and repeat.
 * Shown whole (nothing cropped), centred, with the top and bottom melting into the page.
 */
function SketchLoader({ width }: { width: number }) {
  const height = Math.round(width * SKETCH_ASPECT);
  const [layers, setLayers] = useState<{ id: number; index: number }[]>([{ id: 0, index: 0 }]);
  const fades = useRef<Record<number, Animated.Value>>({ 0: new Animated.Value(1) }).current;
  const started = useRef<Record<number, boolean>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(1);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const handleLoaded = useCallback(
    (id: number, index: number) => {
      if (started.current[id] || !alive.current) return;
      started.current[id] = true;

      // blend this sketch in over the previous one, then drop the older layers
      if (id > 0) {
        Animated.timing(fades[id], { toValue: 1, duration: SKETCH_BLEND_MS, useNativeDriver: true }).start(() => {
          if (alive.current) setLayers(prev => prev.filter(l => l.id >= id));
        });
      }

      // after this one has drawn itself, bring in the next one
      timers.current.push(
        setTimeout(() => {
          if (!alive.current) return;
          const newId = nextId.current++;
          fades[newId] = new Animated.Value(0);
          setLayers(prev => [...prev, { id: newId, index: (index + 1) % LOAD_SKETCHES.length }]);
        }, SKETCH_SWITCH_MS)
      );
    },
    [fades]
  );

  return (
    <View style={{ width, height, backgroundColor: C.bg }}>
      {layers.map(layer => (
        <Animated.View
          key={layer.id}
          style={{ position: 'absolute', left: 0, top: 0, width, height, opacity: fades[layer.id] }}
        >
          <ExpoImage
            source={LOAD_SKETCHES[layer.index]}
            style={{ width, height }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            onLoad={() => handleLoaded(layer.id, layer.index)}
          />
        </Animated.View>
      ))}
      <EdgeFade edge="top" height={Math.round(height * 0.14)} />
      <EdgeFade edge="bottom" height={Math.round(height * 0.18)} />
    </View>
  );
}

/* ---------------- Scenic card: photo on top, a short calm label underneath ---------------- */

function ScenicCard({ route, onPress }: { route: (typeof SCENIC_ROUTES)[number]; onPress: () => void }) {
  return (
    <Pressable
      style={s.scenicCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Search buses ${route.title}`}
    >
      <Image source={route.image} style={s.scenicPhoto} resizeMode="cover" />
      <View style={s.scenicBar}>
        <Text style={s.scenicBarText} numberOfLines={1}>{route.title}</Text>
      </View>
    </Pressable>
  );
}

/** A card that rises and fades in calmly as it scrolls into view. */
function RiseIn({
  scrollY,
  top,
  viewport,
  children,
}: {
  scrollY: Animated.Value;
  top: number; // distance of the card from the top of the scroll content
  viewport: number;
  children: React.ReactNode;
}) {
  const from = top - viewport;
  const opacity = scrollY.interpolate({
    inputRange: [from + viewport * 0.04, from + viewport * 0.38],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateY = scrollY.interpolate({
    inputRange: [from + viewport * 0.04, from + viewport * 0.46],
    outputRange: [56, 0],
    extrapolate: 'clamp',
  });
  const scale = scrollY.interpolate({
    inputRange: [from + viewport * 0.04, from + viewport * 0.46],
    outputRange: [0.965, 1],
    extrapolate: 'clamp',
  });
  return <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
}

/**
 * Scenic section: a full-width photo backdrop that moves slower than the page (parallax),
 * glass cards that rise in as you scroll, and soft fades so it melts into the page above and below.
 */
function ScenicSection({
  scrollY,
  viewport,
  routes,
  onPick,
  onExplore,
}: {
  scrollY: Animated.Value;
  viewport: number;
  routes: typeof SCENIC_ROUTES;
  onPick: (route: (typeof SCENIC_ROUTES)[number]) => void;
  onExplore: () => void;
}) {
  const [box, setBox] = useState({ y: 0, h: 900 });
  const [listY, setListY] = useState(0);
  const [cardY, setCardY] = useState<Record<string, number>>({});
  const RANGE = 80;

  const bgShift = scrollY.interpolate({
    inputRange: [box.y - viewport, box.y + box.h],
    outputRange: [-RANGE, RANGE],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={s.scenicSection}
      onLayout={e => setBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
    >
      {/* backdrop (taller than the section so it can drift) */}
      <Animated.Image
        source={IMAGES.scenicBg}
        resizeMode="cover"
        style={[
          s.scenicBg,
          { top: -RANGE, height: box.h + RANGE * 2, transform: [{ translateY: bgShift }] },
        ]}
      />

      {/* soft fades into the page */}
      <EdgeFade edge="top" height={150} />
      <EdgeFade edge="bottom" height={190} />

      <View style={s.scenicInner}>
        <View style={s.scenicHeading}>
          <Text style={s.sectionTitle}>Scenic journeys</Text>
          <Text style={s.sectionSubtitle}>Beautiful roads, one tap away</Text>
        </View>

        <View onLayout={e => setListY(e.nativeEvent.layout.y)}>
          {routes.map(route => (
            <View
              key={route.key}
              onLayout={e => {
                const y = e.nativeEvent.layout.y;
                setCardY(prev => (prev[route.key] === y ? prev : { ...prev, [route.key]: y }));
              }}
            >
              <RiseIn scrollY={scrollY} top={box.y + listY + (cardY[route.key] ?? 0)} viewport={viewport}>
                <ScenicCard route={route} onPress={() => onPick(route)} />
              </RiseIn>
            </View>
          ))}
        </View>

        <Pressable style={s.exploreButton} onPress={onExplore} android_ripple={{ color: C.burgundyLight }}>
          <Text style={s.exploreText}>Explore all scenic routes</Text>
          <Ionicons name="arrow-forward" size={16} color={C.burgundy} />
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- Offers + footer (melts in from the page, sits on a soft tint) ---------------- */

function OffersFooter({
  bottomInset,
  onCopy,
  onOffer,
  onHelp,
}: {
  bottomInset: number;
  onCopy: (code: string) => void;
  onOffer: (offer: (typeof OFFERS)[number]) => void;
  onHelp: () => void;
}) {
  const router = useRouter();
  return (
    <View style={s.footer}>
      <EdgeFade edge="top" height={120} />

      <View style={[s.footerInner, { paddingBottom: bottomInset + 26 }]}>
        {OFFERS.length > 0 && (
          <>
            <View style={s.offersHeading}>
              <Text style={s.sectionTitle}>Offers for you</Text>
              <Text style={s.sectionSubtitle}>Small things that make travel nicer</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.slider}
              contentContainerStyle={s.sliderContent}
              snapToInterval={OFFER_W + 12}
              decelerationRate="fast"
            >
              {OFFERS.map(offer => (
                <Pressable
                  key={offer.key}
                  style={s.offerCard}
                  onPress={() => (offer.code ? onCopy(offer.code) : onOffer(offer))}
                  android_ripple={{ color: C.burgundyLight }}
                >
                  <View style={s.offerIcon}>
                    <Ionicons name={offer.icon} size={20} color={C.burgundy} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.offerTitle} numberOfLines={1}>{offer.title}</Text>
                    <Text style={s.offerCaption} numberOfLines={2}>{offer.caption}</Text>
                    {!!offer.code && (
                      <View style={s.offerCode}>
                        <Text style={s.offerCodeText}>{offer.code}</Text>
                        <Ionicons name="copy-outline" size={12} color={C.burgundy} />
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <View style={[s.footerBrand, OFFERS.length > 0 && { marginTop: 34 }]}>
          <View style={s.brandMark}>
            <Ionicons name="bus-outline" size={19} color={C.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.footerBrandText}>stable<Text style={s.brandAccent}>bus</Text></Text>
            <Text style={s.footerTagline}>Calm journeys, every time.</Text>
          </View>
        </View>

        <View style={s.footerLinks}>
          {FOOTER_LINKS.map(link => (
            <Pressable
              key={link.key}
              hitSlop={8}
              onPress={() => {
                if (link.key === 'help') router.push('/help' as any);
                else if (link.key === 'terms') router.push('/terms' as any);
                else if (link.key === 'privacy') router.push('/privacy' as any);
                else if (link.key === 'agreement') router.push('/user-agreement' as any);
              }}
            >
              <Text style={s.footerLink}>{link.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.footerCopy}>© {new Date().getFullYear()} StableBus. Safe travels.</Text>
      </View>
    </View>
  );
}

/* ---------------- Welcome / login ---------------- */

function WelcomeLogin({
  visible,
  onSkip,
  onLoggedIn,
}: {
  visible: boolean;
  onSkip: () => void;
  onLoggedIn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const keyboardTop = useKeyboardTop();
  const { overlap, measure } = useKeyboardOverlap(rootRef, keyboardTop);

  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!visible) {
      setStep('phone');
      setOtp('');
      setError('');
    }
  }, [visible]);

  const [box, setBox] = useState({ w: width, h: height });
  const phoneValid = MOBILE_RE.test(mobile);

  async function send() {
    if (busy) return;
    if (!phoneValid) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await sendOTP(mobile);
      setStep('otp');
      setOtp('');
      setCountdown(45);
    } catch (e: any) {
      setError(friendlyError(e, "We couldn't send the OTP. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const result = await verifyOTP(mobile, otp);
      await saveTokens({ access_token: result.access_token, refresh_token: result.refresh_token });
      registerPush(); // register this phone for notifications (never blocks or fails the login)
      onLoggedIn();
    } catch (e: any) {
      setOtp('');
      setError(
        e?.status === 401
          ? 'That code is invalid or has expired. Please try again.'
          : friendlyError(e, 'Verification failed. Please try again.')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onSkip}
    >
      <View
        ref={rootRef}
        collapsable={false}
        style={s.welcomeRoot}
        onLayout={e => {
          measure();
          const { width: w, height: h } = e.nativeEvent.layout;
          setBox(b => (b.w === w && b.h === h ? b : { w, h }));
        }}
      >
        {/* The photo fills the whole screen */}
        <View style={StyleSheet.absoluteFill}>
          <FocusImage source={IMAGES.sunset} aspect={1200 / 675} focusX={0.3} width={box.w} height={box.h} />
        </View>

        {/* Soft fade for readability, only where the form sits */}
        <View style={s.scrim} pointerEvents="none">
          {SCRIM.map((alpha, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: `rgba(28,16,16,${alpha})` }} />
          ))}
        </View>

        <View style={[s.welcomeTop, { paddingTop: insets.top + 10 }]}>
          <View style={s.welcomeBrand}>
            <Image source={IMAGES.icon} style={s.brandIcon} resizeMode="contain" />
            <Text style={s.welcomeBrandText}>stablebus</Text>
          </View>
          <Pressable onPress={onSkip} hitSlop={10} style={s.skipButton} accessibilityRole="button">
            <Text style={s.skipText}>Skip</Text>
          </Pressable>
        </View>

        <View
          style={[
            s.welcomeForm,
            { bottom: overlap, paddingBottom: (overlap > 0 ? 0 : insets.bottom) + 20 },
          ]}
        >
          <Text style={s.welcomeTitle}>{step === 'phone' ? 'Welcome aboard' : 'Enter the code'}</Text>
          <Text style={s.welcomeSubtitle}>
            {step === 'phone'
              ? 'Log in to keep your passengers and trips in one place.'
              : `We sent a 6-digit code to +91 ${mobile}.`}
          </Text>

          {step === 'phone' ? (
            <View style={s.inputRow}>
              <Text style={s.inputPrefix}>+91</Text>
              <TextInput
                value={mobile}
                onChangeText={t => {
                  setMobile(t.replace(/\D/g, '').slice(0, 10));
                  if (error) setError('');
                }}
                placeholder="Mobile number"
                placeholderTextColor="#A99B94"
                keyboardType="number-pad"
                maxLength={10}
                style={s.inputField}
                returnKeyType="done"
                onSubmitEditing={send}
              />
            </View>
          ) : (
            <View style={s.inputRow}>
              <TextInput
                value={otp}
                onChangeText={t => {
                  setOtp(t.replace(/\D/g, '').slice(0, 6));
                  if (error) setError('');
                }}
                placeholder="• • • • • •"
                placeholderTextColor="#C9BDB6"
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                style={[s.inputField, s.otpField]}
                returnKeyType="done"
                onSubmitEditing={verify}
              />
            </View>
          )}

          {!!error && <Text style={s.welcomeError}>{error}</Text>}

          <Pressable
            style={[s.welcomeButton, (busy || (step === 'phone' ? !phoneValid : otp.length !== 6)) && s.welcomeButtonOff]}
            onPress={step === 'phone' ? send : verify}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={s.welcomeButtonText}>{step === 'phone' ? 'Continue' : 'Verify and continue'}</Text>
            )}
          </Pressable>

          {step === 'otp' && (
            <View style={s.otpLinks}>
              <Pressable onPress={() => { setStep('phone'); setOtp(''); setError(''); }} hitSlop={8}>
                <Text style={s.welcomeLink}>Change number</Text>
              </Pressable>
              <Pressable onPress={send} disabled={countdown > 0 || busy} hitSlop={8}>
                <Text style={[s.welcomeLink, countdown > 0 && { opacity: 0.6 }]}>
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                </Text>
              </Pressable>
            </View>
          )}

          <Text style={s.termsOnPhoto}>
            By continuing you agree to our{' '}
            <Text style={s.termsOnPhotoLink} onPress={() => router.push('/terms' as any)}>Terms &amp; Conditions</Text>
            {' '}and{' '}
            <Text style={s.termsOnPhotoLink} onPress={() => router.push('/privacy' as any)}>Privacy Policy</Text>.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [cities, setCities] = useState<City[]>([]);
  const [from, setFrom] = useState<City | null>(null);
  const [to, setTo] = useState<City | null>(null);
  const [journeyDate, setJourneyDate] = useState(dateKey(new Date()));

  const [picker, setPicker] = useState<CityField | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);

  const [loadingCities, setLoadingCities] = useState(true);
  const [searching, setSearching] = useState(false);
  const [cityError, setCityError] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const progress = useRef(new Animated.Value(0)).current;
  const searchingRef = useRef(false);
  const loaderWidth = Math.min(width - 50, 520);
  const insets = useSafeAreaInsets();

  const [authed, setAuthed] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [scenicOpen, setScenicOpen] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { height: viewportHeight } = useWindowDimensions();

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

  // First open: not logged in -> show the welcome screen (once per app open).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tokens = await getTokens();
        if (!alive) return;
        setAuthed(!!tokens);
        if (!tokens && !welcomeDismissed) setWelcomeVisible(true);
      } catch {
        if (alive && !welcomeDismissed) setWelcomeVisible(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const skipWelcome = () => {
    welcomeDismissed = true;
    setWelcomeVisible(false);
  };

  const handleLoggedIn = () => {
    welcomeDismissed = true;
    setAuthed(true);
    setWelcomeVisible(false);
    showToast('You are logged in.');
  };

  const copyOffer = async (code: string) => {
    try {
      // expo-clipboard is optional: without it the code is simply shown in the message.
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(code);
      showToast(`Code ${code} copied.`);
    } catch {
      showToast(`Your code: ${code}`);
    }
  };

  const handleOffer = (offer: (typeof OFFERS)[number]) => {
    if (offer.route) router.push(offer.route as any);
  };

  useEffect(() => {
    searchingRef.current = searching;
  }, [searching]);

  // Slow, calm progress bar (native driver, keeps moving while JS is busy).
  useEffect(() => {
    if (!searching) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [searching, progress]);

  const progressMotionStyle = {
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-95, 95],
        }),
      },
    ],
  };

  // Keep the loader up until Home actually loses focus (Results is on screen),
  // and reset it when Home regains focus (user comes back).
  useFocusEffect(
    useCallback(() => {
      setSearching(false);
      // Coming back from the menu screen: it may ask for the login screen, and the user may have
      // logged in or out meanwhile.
      getTokens()
        .then(tokens => {
          setAuthed(!!tokens);
        })
        .catch(() => undefined);
      if (menuSignals.showWelcome) {
        menuSignals.showWelcome = false;
        setWelcomeVisible(true);
      }
      return () => {
        if (searchingRef.current) {
          setTimeout(() => setSearching(false), 600);
        }
      };
    }, [])
  );

  const today = new Date();
  const todayKey = dateKey(today);
  const maxDate = new Date(
    today.getFullYear() + 1,
    today.getMonth(),
    today.getDate()
  );
  const maxDateKey = dateKey(maxDate);

  const [calendarMonth, setCalendarMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  useEffect(() => {
    let alive = true;

    const loadCities = async () => {
      try {
        setLoadingCities(true);
        setCityError('');

        const response = await withRetry(() => searchApi.cities());
        const cityList = Array.isArray(response?.cityDetails)
          ? response.cityDetails
          : [];

        if (alive) setCities(cityList);
      } catch (error: any) {
        console.error('[StableBus Home] City loading failed:', error);
        if (alive) {
          setCityError(error?.message || 'Unable to load cities.');
        }
      } finally {
        if (alive) setLoadingCities(false);
      }
    };

    loadCities();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const restore = async () => {
      const saved = await readHomePreferences();
      if (!alive) return;
      if (saved?.journeyDate && saved.journeyDate >= todayKey && saved.journeyDate <= maxDateKey) {
        setJourneyDate(saved.journeyDate);
      }
      if (saved && cities.length) {
        const savedFrom = cities.find(c => String(c.cityID) === String(saved.fromCityId));
        const savedTo = cities.find(c => String(c.cityID) === String(saved.toCityId));
        if (savedFrom) setFrom(savedFrom);
        if (savedTo && String(savedTo.cityID) !== String(savedFrom?.cityID)) setTo(savedTo);
      }
      setPreferencesLoaded(true);
    };
    restore();
    return () => { alive = false; };
  }, [cities.length]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void writeHomePreferences({
      fromCityId: from ? String(from.cityID) : undefined,
      toCityId: to ? String(to.cityID) : undefined,
      journeyDate,
    });
  }, [from, to, journeyDate, preferencesLoaded]);

  const quickDates = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        return dateKey(date);
      }),
    []
  );

  const popularNames = [
    'Hyderabad',
    'Bengaluru',
    'Vijayawada',
    'Chennai',
    'Tirupati',
    'Nellore',
    'Guntur',
    'Mumbai',
  ];

  const popularCities = popularNames
    .map((name) =>
      cities.find(
        (city) => city.cityName.toLowerCase() === name.toLowerCase()
      )
    )
    .filter(Boolean) as City[];

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const numberOfDays = new Date(year, month + 1, 0).getDate();

    return [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: numberOfDays }, (_, index) =>
        dateKey(new Date(year, month, index + 1))
      ),
    ];
  }, [calendarMonth]);

  const monthTitle = calendarMonth.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const isFirstMonth =
    calendarMonth.getFullYear() === today.getFullYear() &&
    calendarMonth.getMonth() === today.getMonth();

  const isLastMonth =
    calendarMonth.getFullYear() === maxDate.getFullYear() &&
    calendarMonth.getMonth() === maxDate.getMonth();

  const openPicker = (field: CityField) => {
    if (picker) return;
    setPicker(field);
  };

  const closePicker = () => {
    setPicker(null);
  };

  const selectCity = (city: City) => {
    if (picker === 'from') {
      setFrom(city);
      if (to && String(to.cityID) === String(city.cityID)) setTo(null);
    } else {
      setTo(city);
      if (from && String(from.cityID) === String(city.cityID)) setFrom(null);
    }

    closePicker();
  };

  const selectCityRef = useRef(selectCity);
  selectCityRef.current = selectCity;
  const onPickCity = useCallback((city: City) => selectCityRef.current(city), []);

  const swapCities = () => {
    setFrom(to);
    setTo(from);
  };

  const choosePopularRoute = (fromName: string, toName: string) => {
    const departure = findCity(cities, [fromName]);
    const destination = findCity(cities, [toName]);
    if (!departure || !destination) {
      showToast('This route is not available right now.');
      return;
    }
    setFrom(departure);
    setTo(destination);
    showToast(`${departure.cityName} → ${destination.cityName} selected`);
  };

  const openCalendar = () => {
    const selected = new Date(`${journeyDate}T00:00:00`);
    setCalendarMonth(
      new Date(selected.getFullYear(), selected.getMonth(), 1)
    );
    setCalendarVisible(true);
  };

  const selectDate = (value: string) => {
    if (value < todayKey || value > maxDateKey) return;
    setJourneyDate(value);
    setCalendarVisible(false);
  };

  const changeMonth = (amount: number) => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + amount,
          1
        )
    );
  };

  // Warm the search quietly once the route and date have stayed the same for a moment, so the
  // results are usually ready by the time "Search buses" is tapped.
  useEffect(() => {
    if (!from || !to || searching || String(from.cityID) === String(to.cityID)) return;
    const timer = setTimeout(() => {
      const [year, month, day] = journeyDate.split('-');
      fetchBuses({
        from_city: String(from.cityID),
        to_city: String(to.cityID),
        travel_date: `${month}/${day}/${year}`,
      }).catch(() => undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [from, to, journeyDate, searching]);

  const runSearch = async (fromCity: City, toCity: City) => {
    if (searching) return;

    setSearchMessage(`${fromCity.cityName}  →  ${toCity.cityName}`);
    setSearching(true);

    try {
      // Convert YYYY-MM-DD to MM/DD/YYYY
      const [year, month, day] = journeyDate.split('-');
      const travel_date = `${month}/${day}/${year}`;

      const t0 = Date.now();
      const response = await fetchBuses({
        from_city: String(fromCity.cityID),
        to_city: String(toCity.cityID),
        travel_date,
      });

      console.log(`[Search] API answered in ${Date.now() - t0} ms`);
      // Hand the response over in memory, then open Results once the API has fully answered.
      setSearchResponse(response);
      router.push({
        pathname: '/results',
        params: {
          from: fromCity.cityName,
          to: toCity.cityName,
          date: journeyDate,
          fromCityId: String(fromCity.cityID),
          toCityId: String(toCity.cityID),
        },
      });
      // The loader stays until Home loses focus (see useFocusEffect); this is only a safety net.
      setTimeout(() => setSearching(false), 30000);
    } catch (error: any) {
      setSearching(false);
      showToast(`Search failed: ${error?.message || 'Please try again.'}`);
    }
  };

  const searchBuses = () => {
    if (searching) return;
    if (!from || !to) {
      showToast('Please choose both departure and destination cities.');
      return;
    }
    if (String(from.cityID) === String(to.cityID)) {
      showToast('Departure and destination must be different.');
      return;
    }
    runSearch(from, to);
  };

  // From the full-screen list: close it first, then search (two modals must not swap at the same moment).
  const pickScenic = (route: (typeof SCENIC_ROUTES)[number]) => {
    if (scenicOpen) {
      setScenicOpen(false);
      setTimeout(() => openScenicRoute(route), 350);
    } else {
      openScenicRoute(route);
    }
  };

  const openScenicRoute = (route: (typeof SCENIC_ROUTES)[number]) => {
    const fromCity = findCity(cities, route.from);
    const toCity = findCity(cities, route.to);
    if (!fromCity || !toCity) {
      showToast('This route is not available right now.');
      return;
    }
    setFrom(fromCity);
    setTo(toCity);
    runSearch(fromCity, toCity);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {/* HEADER */}
        <View style={[s.header, { paddingTop: insets.top }]}>
          <View style={[s.headerInner, !isMobile && s.wide]}>
            <View style={s.brandRow}>
              <Image source={IMAGES.icon} style={s.brandIcon} resizeMode="contain" />
              <Text style={s.brand}>
                stable<Text style={s.brandAccent}>bus</Text>
              </Text>
            </View>

            <View style={s.headerActions}>
              {!isMobile && (
                <Pressable style={s.helpButton}>
                  <Ionicons name="help-circle-outline" size={17} color={C.muted} />
                  <Text style={s.helpText}>Help & support</Text>
                </Pressable>
              )}
              {authed && (
                <Pressable
                  style={s.walletChip}
                  onPress={() => router.push('/wallet' as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Wallet"
                >
                  <Ionicons name="wallet-outline" size={15} color={C.burgundy} />
                  <Text style={s.walletChipText}>Wallet</Text>
                </Pressable>
              )}
              <Pressable
                style={s.profile}
                onPress={() => router.push('/menu' as any)}
                accessibilityRole="button"
                accessibilityLabel="Open menu"
              >
                <Ionicons name="person-outline" size={17} color={C.burgundy} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* HERO PHOTO: blends into the page and into the booking card */}
        <View style={{ height: isMobile ? 310 : 340, backgroundColor: C.bg }}>
          <FocusImage
            source={IMAGES.hero}
            aspect={1672 / 941}
            focusX={0.5}
            width={width}
            height={isMobile ? 310 : 340}
          />
          <EdgeFade edge="top" height={34} />
          <EdgeFade edge="bottom" height={78} />
        </View>

        {/* BOOKING CARD */}
        <View style={[s.bookingWrap, !isMobile && s.wide]}>
          <View style={s.bookingCard}>
            <View style={s.bookingHeading}>
              <View>
                <Text style={s.bookingTitle}>Book your bus</Text>
                <Text style={s.bookingSubtitle}>
                  Where would you like to go?
                </Text>
              </View>

              <View style={s.bookingIcon}>
                <Ionicons name="ticket-outline" size={19} color={C.burgundy} />
              </View>
            </View>

            {/* ROUTE FIELDS: STACKED ON MOBILE */}
            <View style={[s.routeContainer, isMobile && s.routeContainerMobile]}>
              <Pressable
                style={s.routeField}
                onPress={() => openPicker('from')}
              >
                <View style={s.routeIcon}>
                  <Ionicons
                    name="radio-button-on-outline"
                    size={18}
                    color={C.burgundy}
                  />
                </View>
                <View style={s.routeText}>
                  <Text style={s.fieldLabel}>FROM</Text>
                  <Text
                    numberOfLines={1}
                    style={[s.cityValue, !from && s.placeholder]}
                  >
                    {from?.cityName || 'Select departure city'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={17} color={C.muted} />
              </Pressable>

              <Pressable
                style={[s.swap, isMobile && s.swapMobile]}
                onPress={swapCities}
                accessibilityLabel="Swap departure and destination"
              >
                <Ionicons
                  name={isMobile ? 'swap-vertical-outline' : 'swap-horizontal-outline'}
                  size={19}
                  color={C.burgundy}
                />
              </Pressable>

              <Pressable
                style={s.routeField}
                onPress={() => openPicker('to')}
              >
                <View style={s.routeIcon}>
                  <Ionicons name="location-outline" size={19} color={C.burgundy} />
                </View>
                <View style={s.routeText}>
                  <Text style={s.fieldLabel}>TO</Text>
                  <Text
                    numberOfLines={1}
                    style={[s.cityValue, !to && s.placeholder]}
                  >
                    {to?.cityName || 'Select destination city'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={17} color={C.muted} />
              </Pressable>
            </View>

            {/* DATE HEADING + ALWAYS-VISIBLE CALENDAR ACTION */}
            <View style={s.dateHeading}>
              <View>
                <Text style={s.fieldLabel}>JOURNEY DATE</Text>
                <View style={s.dateSummary}>
                  <Ionicons name="calendar" size={15} color={C.burgundy} />
                  <Text style={s.dateSummaryText}>
                    {new Date(`${journeyDate}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>

              <Pressable style={s.calendarButton} onPress={openCalendar}>
                <Ionicons name="calendar-outline" size={17} color={C.burgundy} />
                <Text style={s.calendarButtonText}>Calendar</Text>
              </Pressable>
            </View>

            {/* FIVE QUICK DATE CARDS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.dateRow}
            >
              {(quickDates.includes(journeyDate) ? quickDates : [journeyDate, ...quickDates]).map(value => {
                const date = dateInfo(value);
                const active = journeyDate === value;

                return (
                  <Pressable
                    key={value}
                    onPress={() => setJourneyDate(value)}
                    style={[
                      s.dateCard,
                      isMobile && s.dateCardMobile,
                      active && s.dateCardActive,
                    ]}
                  >
                    <Text style={[s.dateMonth, active && s.dateActiveText]}>
                      {value === todayKey ? 'TODAY' : date.month.toUpperCase()}
                    </Text>
                    <Text style={[s.dateNumber, active && s.dateActiveText]}>
                      {date.day}
                    </Text>
                    <Text style={[s.dateWeek, active && s.dateActiveText]}>
                      {date.weekday}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={[s.searchButton, searching && s.searchDisabled]}
              onPress={searchBuses}
              disabled={searching}
            >
              <>
                <Ionicons name="search-outline" size={18} color={C.white} />
                <Text style={s.searchText}>Search buses</Text>
                <Ionicons name="arrow-forward" size={17} color={C.white} />
              </>
            </Pressable>
          </View>
        </View>

        {/* POPULAR ROUTES: one calm row you can slide */}
        <View style={[s.popularSection, !isMobile && s.wide]}>
          <View style={s.sectionHeading}>
            <View>
              <Text style={s.sectionTitle}>Popular routes</Text>
              <Text style={s.sectionSubtitle}>Tap a route to fill your search</Text>
            </View>
          </View>
          {loadingCities ? (
            <ActivityIndicator color={C.burgundy} style={{ marginTop: 12 }} />
          ) : cityError ? (
            <View style={s.errorCard}>
              <Ionicons name="alert-circle-outline" size={19} color={C.burgundy} />
              <Text style={s.errorText}>{cityError}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.slider}
              contentContainerStyle={s.sliderContent}
            >
              {POPULAR_ROUTES.map(([departure, destination]) => (
                <Pressable
                  key={`${departure}-${destination}`}
                  style={s.routeChip}
                  onPress={() => choosePopularRoute(departure, destination)}
                  android_ripple={{ color: C.burgundyLight }}
                >
                  <Ionicons name="bus-outline" size={16} color={C.burgundy} />
                  <Text style={s.routeChipText}>{departure}</Text>
                  <Ionicons name="arrow-forward" size={13} color={C.muted} />
                  <Text style={s.routeChipText}>{destination}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* SCENIC JOURNEYS: part of the page, melts in and out */}
        <ScenicSection
          scrollY={scrollY}
          viewport={viewportHeight}
          routes={SCENIC_ROUTES.slice(0, SCENIC_ON_HOME)}
          onPick={pickScenic}
          onExplore={() => setScenicOpen(true)}
        />

        {/* OFFERS + FOOTER */}
        <OffersFooter
          bottomInset={insets.bottom}
          onCopy={copyOffer}
          onOffer={handleOffer}
          onHelp={() => showToast('Help & support is coming soon.')}
        />

      </Animated.ScrollView>

      {/* FULL-SCREEN CITY PICKER */}
      <CityPickerModal
        field={picker}
        cities={cities}
        loading={loadingCities}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onPick={onPickCity}
        onClose={closePicker}
      />

      {/* FULL-SCREEN SEARCH LOADER: calm scenes that melt into the page */}
      <Modal
        visible={searching}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={[s.searchLoadingScreen, { paddingHorizontal: 0 }]}>
          <View style={{ width }}>
            {/* the whole picture, uncropped, full width */}
            <SketchLoader width={width} />
            <View style={{ alignItems: 'center', paddingHorizontal: 25 }}>
              <View style={s.loadingProgressTrack}>
                <Animated.View style={[s.loadingProgressFill, progressMotionStyle]} />
              </View>
              <Text style={s.searchLoadingTitle}>Finding your buses</Text>
              {!!searchMessage && (
                <Text style={s.searchLoadingSubtitle}>{searchMessage}</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* CALENDAR */}
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.calendarCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Choose travel date</Text>
                <Text style={s.modalSubtitle}>Available for the next 12 months</Text>
              </View>
              <Pressable
                style={s.closeButton}
                onPress={() => setCalendarVisible(false)}
              >
                <Ionicons name="close" size={19} color={C.ink} />
              </Pressable>
            </View>

            <View style={s.monthHeader}>
              <Text style={s.monthTitle}>{monthTitle}</Text>
              <View style={s.monthControls}>
                <Pressable
                  style={s.monthArrow}
                  disabled={isFirstMonth}
                  onPress={() => changeMonth(-1)}
                >
                  <Ionicons
                    name="chevron-back"
                    size={17}
                    color={isFirstMonth ? '#D5CCC5' : C.ink}
                  />
                </Pressable>
                <Pressable
                  style={s.monthArrow}
                  disabled={isLastMonth}
                  onPress={() => changeMonth(1)}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color={isLastMonth ? '#D5CCC5' : C.ink}
                  />
                </Pressable>
              </View>
            </View>

            <View style={s.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <View key={`${day}-${index}`} style={s.calendarCell}>
                  <Text style={s.calendarWeekday}>{day}</Text>
                </View>
              ))}

              {calendarDays.map((value, index) => {
                if (!value) {
                  return <View key={`blank-${index}`} style={s.calendarCell} />;
                }

                const selected = value === journeyDate;
                const disabled = value < todayKey || value > maxDateKey;

                return (
                  <View key={value} style={s.calendarCell}>
                    <Pressable
                      disabled={disabled}
                      onPress={() => selectDate(value)}
                      style={[
                        s.calendarDay,
                        selected && s.calendarDaySelected,
                        disabled && s.calendarDayDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          s.calendarDayText,
                          selected && s.calendarDayTextSelected,
                          disabled && s.calendarDayTextDisabled,
                        ]}
                      >
                        {dateInfo(value).day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={s.calendarFooter}>
              <View>
                <Text style={s.selectedLabel}>SELECTED DATE</Text>
                <Text style={s.selectedDate}>
                  {new Date(`${journeyDate}T00:00:00`).toLocaleDateString(
                    'en-IN',
                    { day: 'numeric', month: 'short', year: 'numeric' }
                  )}
                </Text>
              </View>
              <Pressable
                style={s.doneButton}
                onPress={() => setCalendarVisible(false)}
              >
                <Text style={s.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ALL SCENIC ROUTES */}
      <Modal
        visible={scenicOpen}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setScenicOpen(false)}
      >
        <View style={[s.scenicScreen, { paddingTop: insets.top + 10 }]}>
          <Image source={IMAGES.scenicBg} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(${PAGE_RGB},0.25)` }]} />
          <View style={s.scenicScreenHeader}>
            <Pressable style={s.closeButton} onPress={() => setScenicOpen(false)} accessibilityLabel="Close">
              <Ionicons name="arrow-back" size={20} color={C.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Scenic journeys</Text>
              <Text style={s.modalSubtitle}>Tap a route to see buses for your date</Text>
            </View>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.scenicScreenList, { paddingBottom: insets.bottom + 24 }]}
          >
            {SCENIC_ROUTES.map(route => (
              <ScenicCard key={route.key} route={route} onPress={() => pickScenic(route)} />
            ))}
          </ScrollView>
        </View>
      </Modal>

      <WelcomeLogin visible={welcomeVisible} onSkip={skipWelcome} onLoggedIn={handleLoggedIn} />

      {!!toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.toastWrap,
            {
              top: insets.top + 10,
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            },
          ]}
        >
          <View style={s.toast}>
            <View style={s.toastIcon}>
              <Ionicons name="information" size={14} color="#fff" />
            </View>
            <Text style={s.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 0 },

  wide: { maxWidth: 1080, width: '100%', alignSelf: 'center' },

  /* Header */
  header: { backgroundColor: C.bg },
  headerInner: {
    height: 62,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 46, height: 26 },
  brandMark: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: C.ink,
  },
  brandAccent: { color: C.burgundy },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  helpButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  helpText: { fontSize: 11, color: C.muted, fontWeight: '500' },
  walletChip: {
    height: 33,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletChipText: { fontSize: 13, fontWeight: '600', color: C.burgundy },
  profile: {
    width: 33,
    height: 33,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Hero */
  hero: {
    backgroundColor: C.hero,
    minHeight: 205,
    overflow: 'hidden',
  },
  heroMobile: { minHeight: 157 },
  heroInner: {
    minHeight: 205,
    paddingHorizontal: 25,
    paddingVertical: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: {
    color: '#E8D6D1',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: C.white,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginTop: 8,
    maxWidth: 460,
  },
  heroTitleMobile: { fontSize: 23, lineHeight: 28, marginTop: 7 },
  heroSubtitle: {
    color: '#EADBD7',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  heroArtwork: {
    width: 150,
    height: 120,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 15,
  },
  heroArtworkMobile: {
    width: 70,
    height: 70,
    borderRadius: 40,
    marginLeft: 8,
  },

  /* Booking card */
  bookingWrap: {
    paddingHorizontal: 20,
    marginTop: -42,
    zIndex: 2,
  },
  bookingCard: {
    backgroundColor: C.paper,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    padding: 17,
    shadowColor: '#4B3030',
    shadowOpacity: 0.055,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  bookingHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  bookingTitle: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.35,
    color: C.ink,
  },
  bookingSubtitle: { fontSize: 11, color: C.muted, marginTop: 4 },
  bookingIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Route */
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  routeContainerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
  },
  routeField: {
    flex: 1,
    minWidth: 0,
    minHeight: 63,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FCF9F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeIcon: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: { flex: 1, minWidth: 0 },
  fieldLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.75,
  },
  cityValue: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  placeholder: { color: '#A4948C', fontWeight: '400' },
  swap: {
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: C.burgundyLight,
    borderWidth: 1,
    borderColor: '#E9D8D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapMobile: {
    alignSelf: 'center',
    marginVertical: 5,
    width: 29,
    height: 29,
  },

  /* Dates */
  dateHeading: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateHint: { fontSize: 10, color: C.muted, marginTop: 4 },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
  },
  calendarButtonText: {
    color: C.burgundy,
    fontSize: 10,
    fontWeight: '600',
  },
  dateRow: { gap: 8, paddingBottom: 2 },
  dateCard: {
    width: 68,
    height: 69,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dateCardMobile: { width: 57, height: 65 },
  dateCardActive: {
    backgroundColor: C.burgundyLight,
    borderColor: '#DCC2C5',
  },
  dateSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
    paddingLeft: 10,
    paddingRight: 6,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.burgundyLight,
    alignSelf: 'flex-start',
  },
  dateSummaryText: { color: C.burgundy, fontSize: 13, fontWeight: '600' },
  dateMonth: {
    fontSize: 8,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.3,
  },
  dateNumber: {
    fontSize: 19,
    fontWeight: '600',
    color: C.ink,
  },
  dateWeek: { fontSize: 9, color: C.muted },
  dateActiveText: { color: C.burgundy },

  searchButton: {
    height: 47,
    borderRadius: 10,
    marginTop: 15,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  searchDisabled: { opacity: 0.65 },
  searchText: { fontSize: 13, color: C.white, fontWeight: '600' },

  /* Full-screen city picker and search feedback */
  fullScreenPicker: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === 'android' ? 34 : 54,
    paddingHorizontal: 18,
  },
  fullScreenPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 18,
  },
  pickerTitleWrap: { flex: 1 },
  fullScreenCityList: { paddingBottom: 30 },
  pickerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pickerLoadingText: { color: C.muted, fontSize: 12, marginTop: 12 },
  routeFeedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  routeFeedbackText: { color: '#47765B', fontSize: 11, fontWeight: '600' },
  searchLoadingOverlay: {
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: C.bg,
  },
  searchLoadingScreen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  loadingCenter: { alignItems: 'center', width: '100%' },
  searchLoadingTitle: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginTop: 18,
  },
  searchLoadingSubtitle: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingProgressTrack: {
    width: 190,
    height: 3,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#E9DDD7',
    marginTop: 10,
  },
  loadingProgressFill: {
    width: '34%',
    height: '100%',
    borderRadius: 9,
    backgroundColor: C.burgundy,
  },

  /* Popular cities */
  popularSection: {
    paddingHorizontal: 20,
    marginTop: 29,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: C.ink,
  },
  sectionSubtitle: { fontSize: 11, color: C.muted, marginTop: 4 },
  popularTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.burgundyLight,
  },
  popularTagText: { color: C.burgundy, fontSize: 9, fontWeight: '600' },
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  popularCardMobile: { minWidth: 0, width: '100%' },
  popularCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 180,
    minHeight: 62,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  popularCardMobile: { minWidth: 135 },
  popularIcon: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularText: { flex: 1, minWidth: 0 },
  popularName: { fontSize: 11, fontWeight: '600', color: C.ink },
  popularCaption: { fontSize: 9, color: C.muted, marginTop: 3 },
  emptyPopular: { fontSize: 11, color: C.muted, paddingVertical: 15 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.burgundyLight,
  },
  errorText: { flex: 1, color: C.burgundy, fontSize: 11 },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 30, 28, 0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '82%',
    padding: 17,
    borderRadius: 17,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: C.ink },
  modalSubtitle: { fontSize: 10, color: C.muted, marginTop: 4 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrap: {
    height: 43,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FCF9F5',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    outlineStyle: 'none' as any,
  },
  cityList: { marginTop: 8 },
  cityOption: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  optionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionName: { flex: 1, fontSize: 12, fontWeight: '600', color: C.ink },
  emptyText: { textAlign: 'center', color: C.muted, padding: 22 },

  /* Calendar */
  calendarCard: {
    width: '100%',
    maxWidth: 370,
    padding: 17,
    borderRadius: 17,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  monthControls: { flexDirection: 'row', gap: 7 },
  monthArrow: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: '#F5F0EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: '14.2857%',
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWeekday: { fontSize: 10, fontWeight: '600', color: C.muted },
  calendarDay: {
    width: 32,
    height: 32,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: { backgroundColor: C.burgundy },
  calendarDayDisabled: { opacity: 0.28 },
  calendarDayText: { fontSize: 11, color: C.ink },
  calendarDayTextSelected: { color: C.white, fontWeight: '700' },
  calendarDayTextDisabled: { color: C.muted },
  calendarFooter: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted,
  },
  selectedDate: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink,
    marginTop: 4,
  },
  doneButton: {
    paddingHorizontal: 17,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: C.burgundy,
  },
  doneText: { color: C.white, fontSize: 11, fontWeight: '600' },

  /* Sliders */
  slider: { marginHorizontal: -20 },
  sliderContent: { paddingHorizontal: 20, gap: 12 },
  routeChip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeChipText: { color: C.ink, fontSize: 13, fontWeight: '500' },

  /* Scenic */
  /* Offers + footer */
  footer: { backgroundColor: '#EFE4DC' },
  footerInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 54,
  },
  offersHeading: { marginBottom: 14 },
  offerCard: {
    width: OFFER_W,
    minHeight: 112,
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,254,252,0.82)',
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#783D4A',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  offerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTitle: { color: C.ink, fontSize: 15, fontWeight: '600' },
  offerCaption: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  offerCode: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9A0A8',
  },
  offerCodeText: { color: C.burgundy, fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerBrandText: { color: C.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  footerTagline: { color: C.muted, fontSize: 12, marginTop: 2 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 20 },
  footerLink: { color: C.burgundy, fontSize: 13, fontWeight: '500' },
  footerCopy: { color: C.muted, fontSize: 11, marginTop: 18 },

  scenicSection: { marginTop: 18, overflow: 'hidden', backgroundColor: C.bg },
  scenicBg: { position: 'absolute', left: 0, right: 0, width: '100%' },
  scenicInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 90,
  },
  scenicHeading: { paddingHorizontal: 6, marginBottom: 18 },
  scenicCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 22,
    backgroundColor: C.burgundy,
    shadowColor: '#4B2430',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  scenicPhoto: { width: '100%', height: 214, backgroundColor: '#D9CFC6' },
  scenicBar: {
    height: 36,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(120, 61, 74, 0.96)',
  },
  scenicBarText: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  exploreButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.62)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 4,
  },
  exploreText: { color: C.burgundy, fontSize: 14, fontWeight: '600' },
  scenicScreen: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  scenicScreenHeader: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scenicScreenList: { paddingHorizontal: 20, paddingTop: 4 },

  /* Welcome / login */
  welcomeRoot: { flex: 1, backgroundColor: '#2B1A1D' },
  welcomeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  welcomeBrandText: { color: '#fff', fontSize: 19, fontWeight: '700', letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 6 },
  skipButton: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
  },
  welcomeForm: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  welcomeTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 8,
  },
  welcomeSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 18,
  },
  inputRow: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputPrefix: { color: C.ink, fontSize: 15, fontWeight: '600' },
  inputField: { flex: 1, color: C.ink, fontSize: 16, paddingVertical: 0, height: 50 },
  otpField: { textAlign: 'center', letterSpacing: 8, fontSize: 20, fontWeight: '600' },
  welcomeError: { color: '#FFDAD4', fontSize: 13, marginTop: 10 },
  welcomeButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  welcomeButtonOff: { opacity: 0.6 },
  welcomeButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  otpLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  linkText: { color: C.burgundy, fontSize: 13, fontWeight: '600' },
  welcomeLink: { color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  termsOnPhoto: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  termsOnPhotoLink: { color: '#fff', textDecorationLine: 'underline' },
  termsText: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  termsLink: { color: C.burgundy, textDecorationLine: 'underline' },

  /* Profile drawer */
  drawer: { flex: 1, backgroundColor: C.bg },
  drawerWho: {
    marginTop: -40,
    paddingHorizontal: 20,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  drawerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.burgundyLight,
    borderWidth: 3,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerHello: { color: C.ink, fontSize: 18, fontWeight: '600' },
  drawerSub: { color: C.muted, fontSize: 13, marginTop: 3 },
  drawerClose: {
    position: 'absolute',
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(28, 14, 20, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerList: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  drawerRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14 },
  drawerRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  drawerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerLabel: { flex: 1, color: C.ink, fontSize: 16 },
  drawerGroupGap: { height: 1, backgroundColor: C.border, marginTop: 14, marginBottom: 2 },

  /* Toast */
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