import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchApi } from '@/features/search/api';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  green: '#47765B',
  greenLight: '#EDF4EE',
  greenBorder: '#BDD2C1',
  unavailable: '#ECE8E4',
  unavailableBorder: '#DDD7D1',
  unavailableInk: '#A39B95',
  white: '#FFFFFF',

  ladies: '#FCEAF1',
  ladiesBorder: '#E8B8C9',
  ladiesInk: '#A65372',
  ladiesBooked: '#EFE4E9',
  ladiesBookedBorder: '#DCC9D2',
  ladiesBookedInk: '#A08A95',
};

const GRID_GAP = 4;
const GRID_PADDING = 6;
const SEAT_HEIGHT = 58;
const MIN_CELL_FULL = 40; // full-width deck: seats never smaller than this
const MIN_CELL_SIDE = 30; // side-by-side decks: narrower, but still tappable
const DECK_GAP = 14; // horizontal gap between lower and upper deck
const DECK_SPACING = 26;

type Seat = {
  seat_Number?: string;
  seat_Key?: string;
  row?: string | number;
  column?: string | number;
  length?: string | number;
  width?: string | number;
  zIndex?: string | number;
  bookable?: boolean | string | number;
  ladies_Seat?: boolean | string | number;
  fareMaster?: {
    total_Amount?: string | number;
    basic_Amount?: string | number;
  };
  [key: string]: any;
};

type Point = { [key: string]: any };

function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parseRouteObject(value: unknown): any {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseRouteArray(value: unknown): Point[] {
  const parsed = parseRouteObject(value);
  return Array.isArray(parsed) ? parsed : [];
}

function routeString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function numberValue(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isTrue(value: any): boolean {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === 'true' ||
    String(value) === '1'
  );
}

function pointId(point: Point): string {
  const value = firstValue(point, [
    'boarding_Id', 'boarding_ID', 'boardingId', 'boarding_Point_Id', 'boarding_Point_ID',
    'boarding_Point_Key', 'boardingPointKey', 'boardingPointId',
    'dropping_Id', 'dropping_ID', 'droppingId', 'dropping_Point_Id', 'dropping_Point_ID',
    'dropping_Point_Key', 'droppingPointKey', 'droppingPointId',
    'point_Id', 'point_ID', 'pointId', 'id',
  ]);
  return value === undefined ? '' : String(value);
}

function extractSeatMap(response: any): Seat[] {
  const candidates = [
    response?.seatMap,
    response?.data?.seatMap,
    response?.response?.seatMap,
    response?.data?.data?.seatMap,
  ];
  return candidates.find(Array.isArray) || [];
}

function formatMoney(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/* =====================================================
   Seat data is prepared ONCE per seat map, not on every render
===================================================== */

type SeatRow = {
  key: string;
  seat: Seat;
  bookable: boolean;
  ladies: boolean;
  deck: number;
  x: number; // API row
  y: number; // API column
  w: number; // API width
  l: number; // API length
  base: number;
  total: number;
  priceLabel: string;
};

function buildSeatRows(seats: Seat[]): SeatRow[] {
  return seats.map((seat, index) => {
    const base = numberValue(seat.fareMaster?.basic_Amount);
    return {
    key: String(seat.seat_Key || seat.seat_Number || `seat-${index}`),
    seat,
    bookable: isTrue(seat.bookable),
    ladies: isTrue(seat.ladies_Seat),
    deck: numberValue(seat.zIndex),
    x: numberValue(seat.row),
    y: numberValue(seat.column),
    w: Math.max(1, numberValue(seat.width, 1)),
    l: Math.max(1, numberValue(seat.length, 1)),
    base,
    total: numberValue(firstValue(seat.fareMaster, ['total_Amount', 'basic_Amount'])),
    priceLabel: base > 0 ? `₹${Math.round(base)}` : '',
    };
  });
}

/* =====================================================
   SEAT TILE (number only, calm colours)
===================================================== */

const SeatTile = memo(function SeatTile({
  row,
  selected,
  width,
  height,
  onPress,
}: {
  row: SeatRow;
  selected: boolean;
  width: number;
  height: number;
  onPress: (key: string) => void;
}) {
  const { bookable, ladies } = row;

  const background = selected
    ? C.burgundy
    : ladies && !bookable ? C.ladiesBooked
    : !bookable ? C.unavailable
    : ladies ? C.ladies
    : C.greenLight;

  const borderColor = selected
    ? C.burgundy
    : ladies && !bookable ? C.ladiesBookedBorder
    : !bookable ? C.unavailableBorder
    : ladies ? C.ladiesBorder
    : C.greenBorder;

  const textColor = selected
    ? C.white
    : ladies && !bookable ? C.ladiesBookedInk
    : !bookable ? C.unavailableInk
    : ladies ? C.ladiesInk
    : C.green;

  const sleeper = row.l > 1;
  const status = selected ? 'selected' : bookable ? 'available' : 'booked';
  // Booked seats always carry a cross, so they read as "taken" at a glance.
  const iconName = !bookable ? 'close' : sleeper ? 'bed-outline' : 'person-outline';
  const showIcon = !bookable || width >= 40;

  return (
    <Pressable
      onPress={() => onPress(row.key)}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={`Seat ${row.seat.seat_Number || ''}, ${status}${row.priceLabel ? `, ${row.priceLabel}` : ''}`}
      style={[styles.seatTile, { width, height, backgroundColor: background, borderColor }]}
    >
      {showIcon && <Ionicons name={iconName} size={!bookable ? 17 : 14} color={textColor} />}
      <Text numberOfLines={1} style={[styles.seatNumber, { color: textColor }]}>
        {row.seat.seat_Number || '–'}
      </Text>
      {bookable && !!row.priceLabel && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[styles.seatPrice, { color: textColor }]}
        >
          {row.priceLabel}
        </Text>
      )}
    </Pressable>
  );
});

/* =====================================================
   DECK
   Horizontal position = API row (mirrored correction)
   Vertical position   = API column
===================================================== */

const Deck = memo(function Deck({
  title,
  rows,
  selected,
  onToggle,
  deckWidth,
  compact,
}: {
  title: string;
  rows: SeatRow[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  deckWidth: number;
  compact: boolean;
}) {
  const layout = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of rows) {
      if (r.x < minX) minX = r.x;
      if (r.x + r.w - 1 > maxX) maxX = r.x + r.w - 1;
      if (r.y < minY) minY = r.y;
      if (r.y + r.l - 1 > maxY) maxY = r.y + r.l - 1;
    }
    const horizontalCells = maxX - minX + 1;
    const verticalCells = maxY - minY + 1;
    const innerWidth = Math.max(20, deckWidth - GRID_PADDING * 2 - 2);
    const fitted = (innerWidth - (horizontalCells - 1) * GRID_GAP) / horizontalCells;
    const cellWidth = Math.max(compact ? MIN_CELL_SIDE : MIN_CELL_FULL, fitted);
    const gridWidth = horizontalCells * cellWidth + (horizontalCells - 1) * GRID_GAP;
    const gridHeight = verticalCells * SEAT_HEIGHT + (verticalCells - 1) * GRID_GAP;

    const items = rows.map(r => ({
      row: r,
      left: (maxX - (r.x + r.w - 1)) * (cellWidth + GRID_GAP),
      top: (r.y - minY) * (SEAT_HEIGHT + GRID_GAP),
      width: r.w * cellWidth + (r.w - 1) * GRID_GAP,
      height: r.l * SEAT_HEIGHT + (r.l - 1) * GRID_GAP,
    }));

    return { items, gridWidth, gridHeight, scrollable: gridWidth > innerWidth + 0.5 };
  }, [rows, deckWidth, compact]);

  const available = useMemo(() => rows.filter(r => r.bookable).length, [rows]);

  if (!rows.length) return null;

  const grid = (
    <View style={{ width: layout.gridWidth, height: layout.gridHeight }}>
      {layout.items.map(item => (
        <View
          key={item.row.key}
          style={{ position: 'absolute', left: item.left, top: item.top }}
        >
          <SeatTile
            row={item.row}
            selected={selected.has(item.row.key)}
            width={item.width}
            height={item.height}
            onPress={onToggle}
          />
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.deckCard, { width: deckWidth }]}>
      <View style={styles.deckHeader}>
        <Text style={styles.deckTitle}>{title}</Text>
        <Text style={styles.deckMeta}>{available} available</Text>
      </View>

      {layout.scrollable ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.deckScrollContent}
        >
          {grid}
        </ScrollView>
      ) : (
        <View style={styles.deckBody}>{grid}</View>
      )}
    </View>
  );
});

/* =====================================================
   LEGEND
===================================================== */

function Legend({ color, border, label, cross }: { color: string; border: string; label: string; cross?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color, borderColor: border }]}>
        {cross && <Ionicons name="close" size={11} color={C.unavailableInk} />}
      </View>
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

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

function friendlyError(error: any, fallback: string): string {
  const message = String(error?.message || '');
  if (/cannot reach|network request failed/i.test(message)) {
    return "Can't reach the server. Please check your connection.";
  }
  if (/abort/i.test(message)) return 'This is taking longer than expected. Please try again.';
  return message || fallback;
}

/* =====================================================
   MAIN SCREEN
===================================================== */

export default function Seats() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    bus?: string | string[];
    busKey?: string | string[];
    searchKey?: string | string[];
    from?: string | string[];
    to?: string | string[];
    fromCityId?: string | string[];
    toCityId?: string | string[];
    date?: string | string[];
    boardingDetails?: string | string[];
    droppingDetails?: string | string[];
    dropPointMandatory?: string | string[];
  }>();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = screenWidth < 640;

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

  const params = {
    busKey: routeString(routeParams.busKey),
    searchKey: routeString(routeParams.searchKey),
    from: routeString(routeParams.from),
    to: routeString(routeParams.to),
    fromCityId: routeString(routeParams.fromCityId),
    toCityId: routeString(routeParams.toCityId),
    date: routeString(routeParams.date),
    dropPointMandatory: routeString(routeParams.dropPointMandatory),
  };

  // Parse route JSON once, not on every render / seat tap.
  const bus = useMemo(() => parseRouteObject(routeParams.bus), [routeParams.bus]);
  const boardingPoints: Point[] = useMemo(() => {
    const fromRoute = parseRouteArray(routeParams.boardingDetails);
    return fromRoute.length
      ? fromRoute
      : parseRouteArray(bus.boardingDetails || bus.boarding_Details || bus.boarding_Points || bus.boardingPoints);
  }, [routeParams.boardingDetails, bus]);
  const droppingPoints: Point[] = useMemo(() => {
    const fromRoute = parseRouteArray(routeParams.droppingDetails);
    return fromRoute.length
      ? fromRoute
      : parseRouteArray(bus.droppingDetails || bus.dropping_Details || bus.dropping_Points || bus.droppingPoints);
  }, [routeParams.droppingDetails, bus]);
  const defaultBoarding = boardingPoints[0] || null;
  const defaultDropping = droppingPoints[0] || null;

  const seatResponseRef = useRef<any>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [continuing, setContinuing] = useState(false);
  const continuingRef = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo(() => buildSeatRows(seats), [seats]);
  const rowMap = useMemo(() => new Map(rows.map(r => [r.key, r])), [rows]);

  const decks = useMemo(() => {
    const byDeck = new Map<number, SeatRow[]>();
    for (const r of rows) {
      const list = byDeck.get(r.deck);
      if (list) list.push(r);
      else byDeck.set(r.deck, [r]);
    }
    const ids = [...byDeck.keys()].sort((a, b) => a - b);
    const single = ids.length === 1;
    return ids.map(id => ({
      id,
      title: single ? 'Seats' : id === 0 ? 'Lower deck' : id === 1 ? 'Upper deck' : `Deck ${id}`,
      rows: byDeck.get(id) as SeatRow[],
    }));
  }, [rows]);

  const selectedRows = useMemo(() => rows.filter(r => selected.has(r.key)), [rows, selected]);
  const totalFare = useMemo(() => selectedRows.reduce((sum, r) => sum + r.total, 0), [selectedRows]);
  const baseFare = useMemo(() => selectedRows.reduce((sum, r) => sum + r.base, 0), [selectedRows]);

  const lowestFare = useMemo(() => {
    let min = 0;
    for (const r of rows) {
      if (r.bookable && r.base > 0 && (min === 0 || r.base < min)) min = r.base;
    }
    return min;
  }, [rows]);

  // Lower + upper deck sit side by side; any other combination stacks at full width.
  const sideBySide = decks.length === 2 && decks[0].id === 0 && decks[1].id === 1;
  const fullWidth = Math.max(220, Math.min(screenWidth, 760) - 8 * 2 - 8 * 2 - 2);
  const deckWidth = sideBySide ? (fullWidth - DECK_GAP) / 2 : fullWidth;

  useEffect(() => {
    if (defaultBoarding && defaultDropping) {
      loadSeatMap(defaultBoarding, defaultDropping);
    } else {
      setError('Boarding or dropping point information is missing.');
      showToast('Boarding or dropping point information is missing.');
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSeatMap(boardingPoint: Point, droppingPoint: Point) {
    const busKey = params.busKey || bus.bus_Key;
    const searchKey = params.searchKey || bus.search_Key;
    const boardingId = pointId(boardingPoint);
    const droppingId = pointId(droppingPoint);

    if (!busKey || !searchKey || !boardingId || !droppingId) {
      setError('Required bus or journey point information is missing.');
      showToast('Some journey details are missing. Please go back and try again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSeats([]);
      setSelected(new Set());
      seatResponseRef.current = null;

      const response = await searchApi.seatMap({
        bus_key: String(busKey),
        search_key: String(searchKey),
        boarding_id: boardingId,
        dropping_id: droppingId,
      });

      const seatList = extractSeatMap(response);
      if (!seatList.length) {
        throw new Error(
          (response?.response_Header as { error_Desc?: string } | undefined)?.error_Desc ||
            'The provider returned no seat information.'
        );
      }

      seatResponseRef.current = response;
      setSeats(seatList);
    } catch (err: any) {
      console.error('[StableBus] Seat map request failed:', err);
      const message = friendlyError(err, 'Unable to load seats. Please try again.');
      setError(message);
      showToast(message);
    } finally {
      setLoading(false);
    }
  }

  const toggleSeat = useCallback((key: string) => {
    const row = rowMap.get(key);
    if (row && !row.bookable) {
      showToast('This seat is already booked.');
      return;
    }
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [rowMap, showToast]);

  function continueToBoarding() {
    if (continuingRef.current) return;
    if (!selectedRows.length) {
      showToast('Select at least one seat to continue.');
      return;
    }

    continuingRef.current = true;
    setContinuing(true);

    // Let the loader paint first; building the params can take a moment.
    setTimeout(() => {
      const selectedSeats = selectedRows.map(r => r.seat);
      router.push({
        pathname: '/points',
        params: {
          bus: JSON.stringify(bus),
          busKey: String(params.busKey || bus.bus_Key || ''),
          searchKey: String(params.searchKey || bus.search_Key || ''),
          from: params.from,
          to: params.to,

              // Preserve city IDs for the booking request
          fromCityId: params.fromCityId,
          toCityId: params.toCityId,

          date: params.date,
          boardingDetails: JSON.stringify(boardingPoints),
          droppingDetails: JSON.stringify(droppingPoints),
          defaultBoarding: JSON.stringify(defaultBoarding),
          defaultDropping: JSON.stringify(defaultDropping),
          selectedSeats: JSON.stringify(selectedSeats),
          selectedSeatKeys: JSON.stringify(selectedSeats.map(seat => seat.seat_Key || seat.seat_Number)),
          totalFare: String(totalFare),
          seatResponse: JSON.stringify(seatResponseRef.current || {}),
          dropPointMandatory: params.dropPointMandatory,
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
        if (continuingRef.current) {
          setTimeout(() => setContinuing(false), 600);
        }
      };
    }, [])
  );

  const busName = bus.operator_Name || bus.travel_Name || 'Selected bus';
  const selectedNames = selectedRows.map(r => r.seat.seat_Number || 'Seat').join(', ');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={[styles.header, !isMobile && styles.wide, { paddingTop: 10 + insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={21} color={C.ink} />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Select seats</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {params.from || 'Departure'} → {params.to || 'Destination'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + (selectedRows.length > 0 ? 0 : insets.bottom) },
          !isMobile && styles.wide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.busCard}>
          <View style={styles.busIcon}>
            <Ionicons name="bus-outline" size={21} color={C.burgundy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.busName} numberOfLines={1}>{busName}</Text>
            <Text style={styles.busType} numberOfLines={1}>
              {bus.bus_Type || bus.seat_Layout || 'Bus'}
            </Text>
          </View>
          <Text style={styles.busTimes}>
            {bus.departure_Time || ''}
            {bus.departure_Time && bus.arrival_Time ? ' → ' : ''}
            {bus.arrival_Time || ''}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Choose your seats</Text>
            {lowestFare > 0 && (
              <Text style={styles.sectionHint}>from {formatMoney(lowestFare)}</Text>
            )}
          </View>

          <View style={styles.legend}>
            <Legend color={C.greenLight} border={C.greenBorder} label="Available" />
            <Legend color={C.unavailable} border={C.unavailableBorder} label="Booked" cross />
            <Legend color={C.burgundy} border={C.burgundy} label="Selected" />
            <Legend color={C.ladies} border={C.ladiesBorder} label="Ladies" />
          </View>

          {error ? (
            <View style={styles.calmError}>
              <Text style={styles.calmErrorText}>We couldn't load the seats.</Text>
              <Pressable
                style={styles.retryLink}
                hitSlop={8}
                onPress={() => {
                  if (defaultBoarding && defaultDropping) {
                    loadSeatMap(defaultBoarding, defaultDropping);
                  }
                }}
              >
                <Ionicons name="refresh-outline" size={17} color={C.burgundy} />
                <Text style={styles.retryLinkText}>Try again</Text>
              </Pressable>
            </View>
          ) : !loading && !rows.length ? (
            <View style={styles.emptyCard}>
              <Ionicons name="grid-outline" size={28} color={C.muted} />
              <Text style={styles.emptyTitle}>No seats available</Text>
              <Text style={styles.emptyText}>Seat information is not available for this bus.</Text>
            </View>
          ) : (
            <View style={sideBySide ? styles.decksSide : styles.decks}>
              {decks.map(deck => (
                <Deck
                  key={deck.id}
                  title={deck.title}
                  rows={deck.rows}
                  selected={selected}
                  onToggle={toggleSeat}
                  deckWidth={deckWidth}
                  compact={sideBySide}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky summary: Continue is always within reach */}
      {selectedRows.length > 0 && (
        <View style={[styles.bottomBar, !isMobile && styles.wide, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomTitle} numberOfLines={1}>
              {selectedRows.length} seat{selectedRows.length > 1 ? 's' : ''} · {selectedNames}
            </Text>
            <Text style={styles.bottomFare}>{formatMoney(baseFare)}</Text>
          </View>

          <Pressable style={styles.continueButton} onPress={continueToBoarding}>
            <Text style={styles.continueText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
          </Pressable>
        </View>
      )}

      <BarLoader visible={loading} title="Loading seat layout" subtitle={busName} />
      <BarLoader visible={continuing} title="Preparing your booking" subtitle={selectedNames} />

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

/* =====================================================
   STYLES
===================================================== */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

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
  wide: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  headerSubtitle: { marginTop: 3, fontSize: 13, color: C.muted },

  scroll: { flex: 1 },
  content: { width: '100%', padding: 8, gap: 10, paddingBottom: 24 },

  busCard: {
    backgroundColor: C.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  busIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busName: { color: C.ink, fontSize: 15, fontWeight: '600' },
  busType: { color: C.muted, fontSize: 12, marginTop: 3 },
  busTimes: { color: C.muted, fontSize: 12, fontWeight: '500' },

  section: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 8,
  },
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: C.ink },
  sectionHint: { fontSize: 13, color: C.muted },

  legend: {
    paddingHorizontal: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 18, height: 18, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { color: C.muted, fontSize: 12 },

  decks: { gap: DECK_SPACING },
  decksSide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  deckCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FBF9F5',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  deckHeader: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  deckTitle: { color: C.ink, fontSize: 14, fontWeight: '600' },
  deckMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  deckBody: { padding: GRID_PADDING, alignItems: 'center' },
  deckScrollContent: { padding: GRID_PADDING },

  seatTile: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  seatNumber: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  seatPrice: { fontSize: 10, fontWeight: '500', textAlign: 'center', opacity: 0.85, maxWidth: '100%' },

  calmError: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18 },
  calmErrorText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  retryLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14 },
  retryLinkText: { color: C.burgundy, fontSize: 14, fontWeight: '500' },

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
    backgroundColor: C.ladiesInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: { flexShrink: 1, color: C.white, fontSize: 14 },

  loaderScreen: { flex: 1, backgroundColor: '#F8F4ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  loaderTitle: { color: '#382B28', fontSize: 20, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  loaderSubtitle: { color: '#887A73', fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  loaderTrack: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  loaderFill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },

  errorCard: {
    minHeight: 170,
    borderRadius: 14,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  errorText: { color: C.ink, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  retryButton: {
    backgroundColor: C.burgundy,
    borderRadius: 11,
    paddingHorizontal: 22,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: C.white, fontSize: 14, fontWeight: '600' },

  emptyCard: {
    minHeight: 160,
    borderRadius: 14,
    backgroundColor: '#FBF9F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: '600' },
  emptyText: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  bottomBar: {
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bottomInfo: { flex: 1, minWidth: 0 },
  bottomTitle: { color: C.muted, fontSize: 13 },
  bottomFare: { color: C.ink, fontSize: 19, fontWeight: '700', marginTop: 3 },
  continueButton: {
    height: 50,
    paddingHorizontal: 22,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueText: { color: C.white, fontSize: 15, fontWeight: '600' },
});