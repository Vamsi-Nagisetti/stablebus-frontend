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
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildItems,
  asArray,
  filterItems,
  formatDate,
  parseJson,
  pointId,
  str,
  type Item,
  type Kind,
} from '@/features/search/pointHelpers';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
  // soft tint for pickup notes
  noteBg: '#FAF5EB',
  noteBorder: '#F0E6D2',
  noteInk: '#7A6643',
  noteIcon: '#B3924F',
};

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
      android_ripple={{ color: C.burgundyLight }}
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

        {!!item.time && (
          <Text style={[styles.pointTime, selected && styles.pointTimeSelected]}>{item.time}</Text>
        )}
      </View>

      {item.notes.length > 0 && (
        <View style={styles.notes}>
          {item.notes.map(note => (
            <View key={note.text} style={styles.note}>
              <Ionicons name={note.icon} size={14} color={C.noteIcon} />
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

  // Each list keeps its own search text.
  const [queries, setQueries] = useState<Record<Kind, string>>({ boarding: '', dropping: '' });
  const query = queries[tab];
  const setQuery = (text: string) => setQueries(current => ({ ...current, [tab]: text }));

  const allItems = tab === 'boarding' ? boardingItems : droppingItems;
  const items = useMemo(() => filterItems(allItems, query), [allItems, query]);
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
    <View style={styles.listHeading}>
      <Text style={styles.listTitle}>
        {tab === 'boarding' ? 'Where will you board?' : 'Where will you get off?'}
      </Text>
      <Text style={styles.listCount}>
        {query.trim() ? `${items.length} of ${allItems.length}` : `${allItems.length}`} points
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={[styles.header, isWide && styles.wide, { paddingTop: 10 + insets.top }]}>
        <Pressable onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={C.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Boarding & dropping</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <View style={[styles.topArea, isWide && styles.wide]}>
        {/* Boarding / Dropping switch that also shows what has been chosen */}
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
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {kind === 'boarding' ? 'Boarding' : 'Dropping'}
                </Text>
                <Text style={styles.tabValue} numberOfLines={1}>
                  {chosen ? chosen.name : 'Select a point'}
                </Text>
                {!!chosen?.time && <Text style={styles.tabTime}>{chosen.time}</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Search */}
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={C.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'boarding' ? 'Search boarding points' : 'Search dropping points'}
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#C9BDB4" />
            </Pressable>
          )}
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
            {query.trim()
              ? `No ${tab} points match "${query.trim()}".`
              : `No ${tab} points are available for this bus.`}
          </Text>
        }
        ItemSeparatorComponent={Separator}
        initialNumToRender={10}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
          <Ionicons name="arrow-forward" size={17} color={C.white} />
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
    backgroundColor: C.bg,
  },
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
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { color: C.ink, fontSize: 18, fontWeight: '500' },
  headerSubtitle: { color: C.muted, fontSize: 13, marginTop: 3 },

  topArea: { paddingHorizontal: 16, paddingTop: 4 },

  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(120, 61, 74, 0.06)',
  },
  tab: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  tabActive: {
    backgroundColor: C.paper,
    shadowColor: '#783D4A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabLabel: { color: C.muted, fontSize: 12 },
  tabLabelActive: { color: C.burgundy },
  tabValue: { color: C.ink, fontSize: 14, fontWeight: '500', marginTop: 4 },
  tabTime: { color: C.muted, fontSize: 12, marginTop: 3 },

  search: {
    height: 46,
    marginTop: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  searchInput: { flex: 1, color: C.ink, fontSize: 14.5, paddingVertical: 0 },

  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24 },

  listHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  listTitle: { color: C.ink, fontSize: 15, fontWeight: '500' },
  listCount: { color: C.muted, fontSize: 12.5 },

  separator: { height: 10 },
  pointCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  pointCardSelected: { borderColor: '#DDBFC5', backgroundColor: '#FBF5F5' },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D3C7BE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  radioSelected: { borderColor: C.burgundy },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.burgundy },
  pointDetails: { flex: 1, minWidth: 0 },
  pointName: { color: C.ink, fontSize: 15, fontWeight: '500' },
  pointAddress: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  pointTime: { color: C.muted, fontSize: 13, marginLeft: 10, marginTop: 2 },
  pointTimeSelected: { color: C.burgundy },

  notes: { marginTop: 12, gap: 6 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.noteBorder,
    backgroundColor: C.noteBg,
  },
  noteText: { flex: 1, color: C.noteInk, fontSize: 12.5, lineHeight: 18 },

  emptyText: { color: C.muted, fontSize: 14, paddingVertical: 28, textAlign: 'center' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 14,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fareInfo: { flex: 1, minWidth: 0 },
  fareLabel: { color: C.muted, fontSize: 13 },
  fareValue: { color: C.ink, fontSize: 18, fontWeight: '500', marginTop: 3 },
  continueButton: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueDisabled: { opacity: 0.4 },
  continueText: { color: C.white, fontSize: 15, fontWeight: '500' },

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
  loaderTitle: { color: '#382B28', fontSize: 20, fontWeight: '500', letterSpacing: -0.3, textAlign: 'center' },
  loaderSubtitle: { color: '#887A73', fontSize: 13, fontWeight: '400', marginTop: 8, textAlign: 'center' },
  loaderTrack: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  loaderFill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },
});