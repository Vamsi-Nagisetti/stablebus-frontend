import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Point = { [key: string]: any };
type Kind = 'boarding' | 'dropping';
type IconName = keyof typeof Ionicons.glyphMap;

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
  // calm, warm tint for pickup notes (visible, never alarming)
  noteBg: '#FAF4E8',
  noteBorder: '#EFE3C8',
  noteInk: '#6F5B38',
  noteIcon: '#A88445',
};

/* =====================================================
   Helpers: reading provider data
===================================================== */

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asArray(value: unknown): Point[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function str(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function pointId(point: Point, kind: Kind): string {
  const p = kind;
  const value = firstValue(point, [
    `${p}_Id`, `${p}_ID`, `${p}Id`, `${p}_Point_Id`, `${p}_Point_ID`,
    `${p}_Point_Key`, `${p}PointKey`, `${p}PointId`,
    'point_Id', 'point_ID', 'pointId', 'id',
  ]);
  return value == null ? '' : String(value);
}

function rawName(point: Point, kind: Kind): string {
  return stripPhones(
    String(
      firstValue(point, [
        `${kind}_Name`, `${kind}Name`, 'point_Name', 'pointName', 'name', `${kind}_Address`,
      ]) ?? 'Location'
    )
  );
}

// Things we treat as a "heads-up" note rather than part of the address.
const NOTE_RE =
  /\bvan\b|shuttle|feeder|metro|might require|may require|pick[\s-]?up (?:by|from|at|in|via|required)|transfer|\bcab\b/i;

function isNoise(part: string): boolean {
  return (
    /^\d{1,2}:\d{2}(\s*(AM|PM))?$/i.test(part) ||
    /^\d+$/.test(part) ||
    /^N\/?A$/i.test(part) ||
    /^(true|false|yes|no|null|undefined)$/i.test(part)
  );
}

/**
 * Operators send their contact number themselves after booking, so phone numbers are never shown.
 * Removes "Ph: 98450 12345", "+91-9071997773", "080 2234 5678" and the dangling "-" they leave.
 */
const PHONE_LABEL_RE = /\b(?:ph(?:one)?|mob(?:ile)?|contact|tel|call|cell|whatsapp)\.?\s*(?:no\.?|number|nos\.?)?\s*[:\-]?\s*/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s-]*)?(?:\d[\s-]?){8,11}\d/g;

function stripPhones(text: string): string {
  return text
    .replace(new RegExp(`(?:${PHONE_LABEL_RE.source})(?:${PHONE_RE.source})(?:\\s*[,/&]\\s*(?:${PHONE_RE.source}))*`, 'gi'), '')
    .replace(PHONE_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-,:;/&]+\s*$/g, '')
    .replace(/^\s*[-,:;/&]+\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function segments(value: any): string[] {
  if (value === undefined || value === null || typeof value === 'object') return [];
  return String(value)
    .split('^')
    .map(part => stripPhones(part.trim()))
    .filter(part => part && !isNoise(part));
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter(item => {
    const k = item.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function humanize(key: string): string {
  const words = key
    .replace(/^(is|has)_?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

const FLAG_KEY_RE = /van|metro|pick[\s_-]?up|shuttle|feeder|note|remark|instruction/i;
const SKIP_KEY_RE = /name|time|(^|_)id$|key|lat|lon|phone|mobile|contact/i;

/** Display name without a "(Van pickup)" style suffix. */
function pointName(point: Point, kind: Kind): string {
  let name = rawName(point, kind);
  name = name.replace(/\(([^)]*)\)/g, (whole, inner) => (NOTE_RE.test(inner) ? '' : whole));
  name = segments(name)[0] || name.trim();
  return name.replace(/\s{2,}/g, ' ').trim() || 'Location';
}

/** Notes such as "Might require van pickup" or "Metro pickup", gathered from any field. */
function pointNotes(point: Point, kind: Kind): { text: string; icon: IconName }[] {
  const found: string[] = [];

  // Parenthetical in the name, e.g. "Kukatpally (Van pickup)"
  for (const m of rawName(point, kind).matchAll(/\(([^)]*)\)/g)) {
    if (NOTE_RE.test(m[1])) found.push(m[1].trim());
  }

  for (const key of Object.keys(point)) {
    const value = point[key];
    if (SKIP_KEY_RE.test(key) && !FLAG_KEY_RE.test(key)) continue;

    // Flag fields: is_Van_Pickup: true
    if (FLAG_KEY_RE.test(key) && (value === true || /^(true|y|yes|1)$/i.test(String(value)))) {
      const label = humanize(key);
      if (label && !/^(note|remark|instruction)s?$/i.test(label)) found.push(label);
      continue;
    }

    for (const part of segments(value)) {
      if (NOTE_RE.test(part) || (FLAG_KEY_RE.test(key) && part.length > 2)) found.push(part);
    }
  }

  return dedupe(found)
    .slice(0, 3)
    .map(text => ({
      text,
      icon: /metro/i.test(text)
        ? 'train-outline'
        : /van|shuttle|feeder|cab|transfer/i.test(text)
          ? 'car-outline'
          : 'information-circle-outline',
    }));
}

function pointAddress(point: Point, kind: Kind): string {
  const name = pointName(point, kind).toLowerCase();
  const parts = dedupe(
    [point?.[`${kind}_Address`], point?.[`${kind}_Landmark`]]
      .flatMap(segments)
      .filter(part => !NOTE_RE.test(part))
  ).filter(part => part.toLowerCase() !== name);
  return parts.join(' · ');
}

function pointTime(point: Point, kind: Kind): string {
  const value = point?.[`${kind}_Time`] ?? point?.time;
  if (!value) return '';
  const raw = String(value).trim();
  if (/am|pm/i.test(raw)) return raw.toUpperCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = Number(match[1]);
    return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
  }
  return raw;
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

/* =====================================================
   Data prepared once per list
===================================================== */

type Item = {
  id: string;
  point: Point;
  name: string;
  address: string;
  time: string;
  notes: { text: string; icon: IconName }[];
};

function buildItems(points: Point[], kind: Kind): Item[] {
  return points.map((point, index) => ({
    id: pointId(point, kind) || `${kind}-${index}`,
    point,
    name: pointName(point, kind),
    address: pointAddress(point, kind),
    time: pointTime(point, kind),
    notes: pointNotes(point, kind),
  }));
}

/* =====================================================
   Point card
===================================================== */

const PointOption = memo(function PointOption({
  item,
  selected,
  onPress,
}: {
  item: Item;
  selected: boolean;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.pointCard, selected && styles.pointCardSelected]}
    >
      <View style={styles.pointRow}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>

        <View style={styles.pointDetails}>
          <Text style={styles.pointName}>{item.name}</Text>
          {!!item.address && <Text style={styles.pointAddress}>{item.address}</Text>}
        </View>

        {!!item.time && <Text style={styles.pointTime}>{item.time}</Text>}
      </View>

      {item.notes.length > 0 && (
        <View style={styles.notes}>
          {item.notes.map(note => (
            <View key={note.text} style={styles.note}>
              <Ionicons name={note.icon} size={15} color={C.noteIcon} />
              <Text style={styles.noteText}>{note.text}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
});

/** Calm full-screen loader: a title, one line of context and a thin progress bar. */
function BarLoader({ visible, title, subtitle }: { visible: boolean; title: string; subtitle?: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, progress]);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.loaderScreen}>
        <Text style={styles.loaderTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.loaderSubtitle} numberOfLines={2}>{subtitle}</Text>}
        <View style={styles.loaderTrack}>
          <Animated.View
            style={[
              styles.loaderFill,
              { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-95, 95] }) }] },
            ]}
          />
        </View>
      </View>
    </Modal>
  );
}

/* =====================================================
   Screen
===================================================== */

export default function Points() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 640;

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
      }, 3200);
    },
    [toastAnim]
  );
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );
  const listRef = useRef<FlatList<Item>>(null);

  // Parse route JSON once.
  const bus = useMemo(() => parseJson(routeParams.bus) || {}, [routeParams.bus]);
  const boardingItems = useMemo(
    () => buildItems(asArray(routeParams.boardingDetails), 'boarding'),
    [routeParams.boardingDetails]
  );
  const droppingItems = useMemo(
    () => buildItems(asArray(routeParams.droppingDetails), 'dropping'),
    [routeParams.droppingDetails]
  );

  const initialId = (raw: unknown, kind: Kind, items: Item[]): string => {
    const preset = parseJson(raw);
    if (preset && typeof preset === 'object') {
      const id = pointId(preset, kind);
      if (id && items.some(i => i.id === id)) return id;
    }
    return items.length === 1 ? items[0].id : '';
  };

  const [boardingId, setBoardingId] = useState(() =>
    initialId(routeParams.selectedBoardingPoint || routeParams.defaultBoarding, 'boarding', boardingItems)
  );
  const [droppingId, setDroppingId] = useState(() =>
    initialId(routeParams.selectedDroppingPoint || routeParams.defaultDropping, 'dropping', droppingItems)
  );
  const [tab, setTab] = useState<Kind>('boarding');

  const [continuing, setContinuing] = useState(false);
  const continuingRef = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (__DEV__) {
      // Handy when tuning which fields hold pickup notes.
      console.log('[Points] sample boarding point:', boardingItems[0]?.point);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const boarding = useMemo(() => boardingItems.find(i => i.id === boardingId) || null, [boardingItems, boardingId]);
  const dropping = useMemo(() => droppingItems.find(i => i.id === droppingId) || null, [droppingItems, droppingId]);

  const items = tab === 'boarding' ? boardingItems : droppingItems;
  const selectedId = tab === 'boarding' ? boardingId : droppingId;

  const choose = useCallback(
    (id: string) => (tab === 'boarding' ? setBoardingId(id) : setDroppingId(id)),
    [tab]
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) => (
      <PointOption item={item} selected={item.id === selectedId} onPress={choose} />
    ),
    [selectedId, choose]
  );
  const keyExtractor = useCallback((item: Item) => item.id, []);

  const seatCount = useMemo(() => {
    const seats = parseJson(routeParams.selectedSeats);
    return Array.isArray(seats) ? seats.length : 0;
  }, [routeParams.selectedSeats]);

  const from = str(routeParams.from) || 'Departure';
  const to = str(routeParams.to) || 'Destination';
  const busName = bus.operator_Name || bus.travel_Name || '';
  const subtitle = [`${from} → ${to}`, formatDate(str(routeParams.date)), busName]
    .filter(Boolean)
    .join(' · ');

  const canContinue = tab === 'boarding' ? !!boarding : !!dropping;
  // Exactly what the seat screen showed: the sum of each seat's basic fare (no service tax / GST).
  // Calculated here from the selected seats, so it never depends on the taxed `totalFare` param.
  // The payable total including taxes belongs to the final checkout.
  const seatFare = useMemo(() => {
    const seats = parseJson(routeParams.selectedSeats);
    if (Array.isArray(seats)) {
      return seats.reduce((sum: number, seat: any) => sum + (Number(seat?.fareMaster?.basic_Amount) || 0), 0);
    }
    return Number(str(routeParams.baseFare) || 0);
  }, [routeParams.selectedSeats, routeParams.baseFare]);

  function handleContinue() {
    if (continuingRef.current) return;

    if (tab === 'boarding') {
      if (!boarding) {
        showToast('Choose a boarding point to continue.');
        return;
      }
      setTab('dropping');
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    if (!dropping) {
      showToast('Choose a dropping point to continue.');
      return;
    }

    continuingRef.current = true;
    setContinuing(true);

    // Forward everything we received (expo-router params are strings), plus the choices.
    const forward: Record<string, string> = {};
    for (const [key, value] of Object.entries(routeParams)) {
      forward[key] = Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
    }
    const boardingJson = JSON.stringify(boarding!.point);
    const droppingJson = JSON.stringify(dropping.point);

    setTimeout(() => {
      router.push({
        pathname: '/passengers',
        params: {
          ...forward,
          selectedBoardingPoint: boardingJson,
          selectedDroppingPoint: droppingJson,
          defaultBoarding: boardingJson,
          defaultDropping: droppingJson,
          boardingId: pointId(boarding!.point, 'boarding'),
          droppingId: pointId(dropping.point, 'dropping'),
        },
      });
      fallbackTimer.current = setTimeout(() => {
        continuingRef.current = false;
        setContinuing(false);
      }, 30000);
    }, 80);
  }

  // Hide the loader once this screen has been left; reset when we come back.
  useFocusEffect(
    useCallback(() => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      continuingRef.current = false;
      setContinuing(false);
      return () => {
        if (continuingRef.current) setTimeout(() => setContinuing(false), 600);
      };
    }, [])
  );

  const goBack = () => {
    if (tab === 'dropping') {
      setTab('boarding');
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } else {
      router.back();
    }
  };

  const header = (
    <View>
      <View style={styles.tabs}>
        {(['boarding', 'dropping'] as Kind[]).map(kind => {
          const active = tab === kind;
          const chosen = kind === 'boarding' ? boarding : dropping;
          return (
            <Pressable
              key={kind}
              onPress={() => {
                setTab(kind);
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={styles.tabLabel}>{kind === 'boarding' ? 'Boarding' : 'Dropping'}</Text>
              <Text style={styles.tabValue} numberOfLines={1}>
                {chosen ? chosen.name : 'Select point'}
              </Text>
              {!!chosen?.time && <Text style={styles.tabTime}>{chosen.time}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>
          {tab === 'boarding' ? 'Where will you board?' : 'Where will you get off?'}
        </Text>
        <Text style={styles.listCount}>{items.length} points</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={[styles.header, isWide && styles.wide, { paddingTop: 10 + insets.top }]}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={21} color={C.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Boarding & dropping</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        extraData={selectedId}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No {tab} points are available for this bus.
          </Text>
        }
        ItemSeparatorComponent={Separator}
        initialNumToRender={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, isWide && styles.wide]}
      />

      <View style={[styles.bottomBar, isWide && styles.wide, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.fareInfo}>
          <Text style={styles.fareLabel}>
            Seat fare{seatCount > 0 ? ` · ${seatCount} seat${seatCount > 1 ? 's' : ''}` : ''}
          </Text>
          <Text style={styles.fareValue}>₹{seatFare.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
        </View>

        <Pressable
          onPress={handleContinue}
          style={[styles.continueButton, !canContinue && styles.continueDisabled]}
        >
          <Text style={styles.continueText}>{tab === 'boarding' ? 'Next' : 'Continue'}</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </Pressable>
      </View>

      <BarLoader
        visible={continuing}
        title="Preparing passenger details"
        subtitle={dropping ? `${boarding?.name ?? ''} → ${dropping.name}` : ''}
      />

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
              <Ionicons name="information" size={14} color={C.white} />
            </View>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/* =====================================================
   Styles
===================================================== */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wide: { width: '100%', maxWidth: 760, alignSelf: 'center' },

  header: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.paper,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { color: C.ink, fontSize: 17, fontWeight: '600' },
  headerSubtitle: { color: C.muted, fontSize: 13, marginTop: 3 },

  content: { padding: 14, paddingBottom: 24 },

  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tab: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  tabActive: { backgroundColor: C.paper, borderColor: C.burgundy },
  tabLabel: { color: C.muted, fontSize: 12 },
  tabValue: { color: C.ink, fontSize: 14, fontWeight: '600', marginTop: 4 },
  tabTime: { color: C.muted, fontSize: 12, marginTop: 3 },

  listHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  listTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  listCount: { color: C.muted, fontSize: 12 },

  separator: { height: 10 },
  pointCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  pointCardSelected: { borderColor: C.burgundy, backgroundColor: C.burgundyLight },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#B8AAA2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  radioSelected: { borderColor: C.burgundy },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.burgundy },
  pointDetails: { flex: 1, minWidth: 0 },
  pointName: { color: C.ink, fontSize: 15, fontWeight: '600' },
  pointAddress: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  pointTime: { color: C.ink, fontSize: 13, fontWeight: '500', marginLeft: 10, marginTop: 2 },

  notes: { marginTop: 12, gap: 6 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.noteBorder,
    backgroundColor: C.noteBg,
  },
  noteText: { flex: 1, color: C.noteInk, fontSize: 13, lineHeight: 18 },

  emptyText: { color: C.muted, fontSize: 14, paddingVertical: 20, textAlign: 'center' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 14,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fareInfo: { flex: 1, minWidth: 0 },
  fareLabel: { color: C.muted, fontSize: 13 },
  fareValue: { color: C.ink, fontSize: 19, fontWeight: '700', marginTop: 3 },
  continueButton: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueDisabled: { opacity: 0.45 },

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
  toastText: { flexShrink: 1, color: C.white, fontSize: 14 },

  loaderScreen: { flex: 1, backgroundColor: '#F8F4ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  loaderTitle: { color: '#382B28', fontSize: 20, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  loaderSubtitle: { color: '#887A73', fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  loaderTrack: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  loaderFill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },
  continueText: { color: C.white, fontSize: 15, fontWeight: '600' },
});