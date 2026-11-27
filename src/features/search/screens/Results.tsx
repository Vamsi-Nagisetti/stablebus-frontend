import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchApi } from '@/features/search/api';
import { getSearchResponse } from '@/features/search/resultsCache';
import { buildItems, filterItems, type Item as PointItem, type Kind as PointKind } from '@/features/search/pointHelpers';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
};

type Bus = {
  bus_Key?: string;
  operator_Name?: string;
  bus_Type?: string;
  departure_Time?: string;
  arrival_Time?: string;
  available_Seats?: string | number;
  ac?: string | boolean;
  seat_Type?: string;
  seat_Layout?: string;
  fareMasters?: { total_Amount?: string | number }[];
  [key: string]: any;
};

type SearchRoute = { from: string; to: string; fromCityId: string; toCityId: string };
type EditCity = { cityID: string | number; cityName: string };

// Cities are fetched once and kept for the next time the Edit sheet opens.
let citiesMemory: EditCity[] | null = null;

type Sort =
  | 'Recommended'
  | 'Early departure'
  | 'Late departure'
  | 'Price: low to high'
  | 'Price: high to low'
  | 'Highest rated';

type FilterState = {
  busTypes: string[];
  departure: string[];
  arrival: string[];
  operators: string[];
  amenities: string[];
};

const emptyFilters: FilterState = {
  busTypes: [],
  departure: [],
  arrival: [],
  operators: [],
  amenities: [],
};

const sortOptions: Sort[] = [
  'Recommended',
  'Early departure',
  'Late departure',
  'Price: low to high',
  'Price: high to low',
  'Highest rated',
];

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function numeric(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') {
      return obj[key];
    }
  }
  return undefined;
}

function formatPrice(value: any): string {
  const amount = numeric(value);
  return amount
    ? `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : 'Price unavailable';
}

function timeToMinutes(value?: string): number | null {
  if (!value) return null;
  // Accepts "09:30 PM", "21:30", "21:30:00" and ISO date-times.
  const match = String(value).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3] ? match[3].replace(/\./g, '').toUpperCase() : '';

  if (period) {
    if (hour === 12) hour = 0;
    if (period === 'PM') hour += 12;
  }
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

function getDurationMinutes(departure?: string, arrival?: string): number | null {
  const start = timeToMinutes(departure);
  const end = timeToMinutes(arrival);
  if (start === null || end === null) return null;

  let difference = end - start;
  if (difference < 0) difference += 1440;
  return difference;
}

function getDuration(departure?: string, arrival?: string): string {
  const difference = getDurationMinutes(departure, arrival);
  if (difference === null) return '';
  return `${Math.floor(difference / 60)}h ${difference % 60}m`;
}

function formatJourneyDate(value?: string): string {
  if (!value) return '';

  let date: Date;
  if (value.includes('/')) {
    const [month, day, year] = value.split('/');
    date = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    date = new Date(`${value}T00:00:00`);
  }

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isAC(bus: Bus): boolean {
  const text = `${bus.bus_Type || ''} ${bus.seat_Type || ''}`.toLowerCase();
  if (/non[\s\-_/]*a\/?c/.test(text)) return false;
  const flag = String(bus.ac ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(flag)) return true;
  if (['false', '0', 'no', 'n'].includes(flag)) return false;
  return /(^|[^a-z])a\/?c([^a-z]|$)/.test(text);
}

function isSleeper(bus: Bus): boolean {
  return `${bus.bus_Type || ''} ${bus.seat_Type || ''} ${bus.seat_Layout || ''}`
    .toLowerCase()
    .includes('sleeper');
}

function isSeater(bus: Bus): boolean {
  return `${bus.bus_Type || ''} ${bus.seat_Type || ''} ${bus.seat_Layout || ''}`
    .toLowerCase()
    .includes('seater');
}

function getFare(bus: Bus): number {
  return numeric(bus.fareMasters?.[0]?.total_Amount);
}

/** Rating given by StableBus travellers (added by our server). 0 when nobody has rated yet. */
function getRating(bus: Bus): number {
  return numeric(bus.stb_rating?.average);
}

function getRatingCount(bus: Bus): number {
  return numeric(bus.stb_rating?.count);
}

function getAmenities(bus: Bus): string[] {
  const raw = firstValue(bus, [
    'amenities',
    'amenity_List',
    'amenities_List',
    'facility_List',
    'facilities',
  ]);

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) =>
      typeof item === 'string'
        ? item
        : String(firstValue(item, ['amenity_Name', 'name', 'description', 'title']) || '')
    )
    .filter(Boolean);
}

function getTimeBucket(value?: string): string {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '';

  if (minutes >= 360 && minutes < 720) return 'Morning';
  if (minutes >= 720 && minutes < 1020) return 'Afternoon';
  if (minutes >= 1020 && minutes < 1260) return 'Evening';
  return 'Night';
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter(item => item !== value)
    : [...values, value];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function getCalendarDays(month: Date): (number | null)[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  return [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
}

function parseRouteResponse(value: unknown): any {
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

function readRouteString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

type IconName = keyof typeof Ionicons.glyphMap;

const BUS_TYPE_VALUES = ['AC', 'Non-AC', 'Sleeper', 'Seater'];
const QUICK_TYPES = ['AC', 'Non-AC', 'Sleeper', 'Seater'] as const;
const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  AC: 'snow-outline',
  'Non-AC': 'sunny-outline',
  Sleeper: 'bed-outline',
  Seater: 'person-outline',
};
const TIME_VALUES = ['Morning', 'Afternoon', 'Evening', 'Night'];
const TIME_ICONS: Record<string, IconName> = {
  Morning: 'partly-sunny-outline',
  Afternoon: 'sunny-outline',
  Evening: 'cloudy-night-outline',
  Night: 'moon-outline',
};
const TIME_HINTS: Record<string, string> = {
  Morning: '6 AM – 12 PM',
  Afternoon: '12 – 5 PM',
  Evening: '5 – 9 PM',
  Night: '9 PM – 6 AM',
};

function amenityIcon(label: string): IconName {
  const t = label.toLowerCase();
  if (/wi-?fi/.test(t)) return 'wifi-outline';
  if (/charg|usb|socket|plug/.test(t)) return 'flash-outline';
  if (/water/.test(t)) return 'water-outline';
  if (/blanket|pillow|bed/.test(t)) return 'bed-outline';
  if (/snack|food|meal/.test(t)) return 'fast-food-outline';
  if (/track|gps|live/.test(t)) return 'locate-outline';
  if (/light|lamp/.test(t)) return 'bulb-outline';
  if (/toilet|wash|rest ?room/.test(t)) return 'male-female-outline';
  if (/\btv\b|movie|entertain|music/.test(t)) return 'tv-outline';
  if (/cctv|camera|safety|secur|first ?aid/.test(t)) return 'shield-checkmark-outline';
  if (/a\/?c|air/.test(t)) return 'snow-outline';
  return 'checkmark-circle-outline';
}

const typeIcon = (label: string) => TYPE_ICONS[label];
const timeIcon = (label: string) => TIME_ICONS[label];
const operatorIcon = () => 'bus-outline' as IconName;

/** Everything we need per bus, computed ONCE when the results arrive. */
type Row = {
  key: string;
  bus: Bus;
  operator: string;
  fare: number;
  ac: boolean;
  sleeper: boolean; // sleeper only
  seater: boolean; // any seats (incl. seater/sleeper)
  mixed: boolean; // seater/sleeper layout
  rating: number;
  depMin: number | null;
  depBucket: string;
  arrBucket: string;
  amenities: string[];
  duration: string;
};

function buildRows(buses: Bus[]): Row[] {
  return buses.map((bus, index) => ({
    key: `${bus.bus_Key || 'bus'}-${index}`,
    bus,
    operator: bus.operator_Name || '',
    fare: getFare(bus),
    ac: isAC(bus),
    // Every bus_Type here contains "Sleeper", and "Seater/Sleeper" buses contain both words.
    // So: Sleeper = sleeper-only, Seater = any bus that has seats.
    sleeper: isSleeper(bus) && !isSeater(bus),
    seater: isSeater(bus),
    mixed: isSleeper(bus) && isSeater(bus),
    rating: getRating(bus),
    depMin: timeToMinutes(bus.departure_Time),
    depBucket: getTimeBucket(bus.departure_Time),
    arrBucket: getTimeBucket(bus.arrival_Time),
    amenities: getAmenities(bus),
    duration: getDuration(bus.departure_Time, bus.arrival_Time),
  }));
}

/**
 * Same group = OR, different groups = AND.
 *  e.g. AC + Sleeper            -> AC buses that are sleepers
 *       Sleeper + Seater        -> sleepers or seaters
 *       Morning + Night         -> departs in the morning or at night
 */
function filterRows(rows: Row[], f: FilterState): Row[] {
  const wantAC = f.busTypes.includes('AC');
  const wantNonAC = f.busTypes.includes('Non-AC');
  const wantSleeper = f.busTypes.includes('Sleeper');
  const wantSeater = f.busTypes.includes('Seater');

  return rows.filter(r => {
    if ((wantAC || wantNonAC) && !((wantAC && r.ac) || (wantNonAC && !r.ac))) return false;
    if ((wantSleeper || wantSeater) && !((wantSleeper && r.sleeper) || (wantSeater && r.seater))) return false;
    if (f.departure.length && !f.departure.includes(r.depBucket)) return false;
    if (f.arrival.length && !f.arrival.includes(r.arrBucket)) return false;
    if (f.operators.length && !f.operators.includes(r.operator)) return false;
    if (f.amenities.length && !f.amenities.every(item => r.amenities.includes(item))) return false;
    return true;
  });
}

/* ---------------------------------------------------------------- */
/* Bus card: memoized, so a tap elsewhere never re-renders every card */
/* ---------------------------------------------------------------- */
const BusCard = memo(function BusCard({
  row,
  from,
  to,
  onPress,
  onViewPoints,
}: {
  row: Row;
  from: string;
  to: string;
  onPress: (bus: Bus) => void;
  onViewPoints: (bus: Bus, kind: PointKind) => void;
}) {
  const { bus } = row;
  const boardingCount = Array.isArray(bus.boardingDetails) ? bus.boardingDetails.length : 0;
  const droppingCount = Array.isArray(bus.droppingDetails) ? bus.droppingDetails.length : 0;

  // AC / Non-AC, seat type, then one amenity the operator lists (clear icon + label).
  const features: { icon: IconName; label: string }[] = [
    { icon: row.ac ? 'snow-outline' : 'sunny-outline', label: row.ac ? 'AC' : 'Non-AC' },
    ...(row.mixed
      ? [{ icon: 'bed-outline' as IconName, label: 'Seater / sleeper' }]
      : row.sleeper
        ? [{ icon: 'bed-outline' as IconName, label: 'Sleeper' }]
        : row.seater
          ? [{ icon: 'person-outline' as IconName, label: 'Seater' }]
          : []),
    ...row.amenities
      .filter(label => label.length <= 14)
      .slice(0, 1)
      .map(label => ({ icon: amenityIcon(label), label })),
  ];
  return (
    <Pressable
      style={s.busCard}
      onPress={() => onPress(bus)}
      android_ripple={{ color: C.burgundyLight }}
    >
      <View style={s.busTop}>
        <View style={s.operatorInfo}>
          <View style={s.busIcon}>
            <Ionicons name="bus-outline" size={21} color={C.burgundy} />
          </View>
          <View style={s.operatorText}>
            <Text style={s.operatorName} numberOfLines={1}>
              {bus.operator_Name || 'Bus operator'}
            </Text>
            <Text style={s.busType} numberOfLines={2}>
              {bus.bus_Type || 'Bus service'}
            </Text>
          </View>
        </View>

        <View style={s.fareBlock}>
          <Text style={s.fareCaption}>Starting from</Text>
          <Text style={s.fareValue}>{formatPrice(row.fare)}</Text>
          {row.rating > 0 && (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={13} color="#C18A43" />
              <Text style={s.ratingText}>
                {row.rating.toFixed(1)}/5
                <Text style={s.ratingCount}> ({getRatingCount(bus)})</Text>
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.features}>
        {features.map(item => (
          <View key={item.label} style={s.feature}>
            <Ionicons name={item.icon} size={17} color={C.burgundy} />
            <Text style={s.featureText} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.cardDivider} />

      <View style={s.journeySection}>
        <View style={s.timelineColumn}>
          <View style={s.timelineTrack}>
            <View style={s.timelineCircle} />
            <View style={s.timelineLine} />
            <View style={[s.timelineCircle, s.timelineCircleEnd]} />
          </View>
          <View style={s.timelineStops}>
            <View style={s.timelineStop}>
              <Text style={s.timeValue}>{bus.departure_Time || '--'}</Text>
              <Text style={s.timeCaption} numberOfLines={1}>{from}</Text>
            </View>
            <View style={s.timelineStop}>
              <Text style={s.timeValue}>{bus.arrival_Time || '--'}</Text>
              <Text style={s.timeCaption} numberOfLines={1}>{to}</Text>
            </View>
          </View>
        </View>

        <View style={s.durationBlock}>
          <Text style={s.durationText}>{row.duration || '—'}</Text>
          <Text style={s.durationCaption}>Journey duration</Text>
        </View>
      </View>

      <View style={s.availabilityRow}>
        <Ionicons name="ticket-outline" size={13} color={C.muted} />
        <Text style={s.seatCount}>{bus.available_Seats ?? '—'} seats available</Text>
      </View>

      {(boardingCount > 0 || droppingCount > 0) && (
        <Pressable
          style={s.pointsLink}
          onPress={() => onViewPoints(bus, boardingCount > 0 ? 'boarding' : 'dropping')}
          hitSlop={{ top: 6, bottom: 6 }}
          accessibilityRole="button"
          accessibilityLabel="View boarding and dropping points"
        >
          <Ionicons name="location-outline" size={15} color={C.burgundy} />
          <Text style={s.pointsLinkText}>Boarding & dropping points</Text>
          <Ionicons name="chevron-forward" size={14} color={C.muted} />
        </Pressable>
      )}
    </Pressable>
  );
});

/* ---------------------------------------------------------------- */
/* Filter sheet: owns its draft state, so ticking a box re-renders    */
/* only this sheet and never the whole results list                   */
/* ---------------------------------------------------------------- */
const FilterOption = memo(function FilterOption({
  group,
  label,
  selected,
  icon,
  hint,
  onToggle,
}: {
  group: keyof FilterState;
  label: string;
  selected: boolean;
  icon?: IconName;
  hint?: string;
  onToggle: (group: keyof FilterState, value: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(group, label)}
      style={s.optionRow}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <View style={[s.checkbox, selected && s.checkboxSelected]}>
        {selected && <Ionicons name="checkmark" size={15} color={C.white} />}
      </View>
      {!!icon && <Ionicons name={icon} size={18} color={selected ? C.burgundy : C.muted} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.optionText} numberOfLines={2}>{label}</Text>
        {!!hint && <Text style={s.optionHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
});

const FilterSection = memo(function FilterSection({
  title,
  icon,
  group,
  values,
  selected,
  optionIcon,
  optionHint,
  onToggle,
}: {
  title: string;
  icon: IconName;
  group: keyof FilterState;
  values: string[];
  selected: string[];
  optionIcon?: (label: string) => IconName | undefined;
  optionHint?: (label: string) => string | undefined;
  onToggle: (group: keyof FilterState, value: string) => void;
}) {
  return (
    <View style={s.filterSection}>
      <View style={s.filterSectionHeader}>
        <Ionicons name={icon} size={17} color={C.burgundy} />
        <Text style={s.filterSectionTitle}>{title}</Text>
      </View>
      {values.length ? (
        <View style={s.filterOptions}>
          {values.map(value => (
            <FilterOption
              key={value}
              group={group}
              label={value}
              selected={selected.includes(value)}
              icon={optionIcon?.(value)}
              hint={optionHint?.(value)}
              onToggle={onToggle}
            />
          ))}
        </View>
      ) : (
        <Text style={s.unavailableText}>
          No {title.toLowerCase()} information provided by the operator.
        </Text>
      )}
    </View>
  );
});

const FilterSheet = memo(function FilterSheet({
  visible,
  onClose,
  onApply,
  rows,
  applied,
  operators,
  amenities,
  isMobile,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
  rows: Row[];
  applied: FilterState;
  operators: string[];
  amenities: string[];
  isMobile: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const backdropRef = useRef<View>(null);
  const keyboardTop = useKeyboardTop();
  const { overlap, frame, measure } = useKeyboardOverlap(backdropRef, keyboardTop);
  const availableHeight = frame.h > 0 ? frame.h : windowHeight;
  const scrollRef = useRef<ScrollView>(null);
  const operatorY = useRef(0);
  const [draft, setDraft] = useState<FilterState>(applied);
  const [operatorSearch, setOperatorSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft(applied);
      setOperatorSearch('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((group: keyof FilterState, value: string) => {
    setDraft(current => ({ ...current, [group]: toggleValue(current[group], value) }));
  }, []);

  const count = useMemo(
    () => filterRows(rows, draft).length,
    [rows, draft]
  );

  const operatorValues = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    return q ? operators.filter(name => name.toLowerCase().includes(q)) : operators;
  }, [operators, operatorSearch]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View ref={backdropRef} collapsable={false} onLayout={measure} style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            s.filterSheet,
            !isMobile && s.filterSheetWide,
            {
              // Lift the whole sheet above the keyboard and shrink it to the space that is left.
              marginBottom: overlap || (isMobile ? 0 : 20),
              maxHeight: Math.max(280, availableHeight - overlap - insets.top - 12),
            },
          ]}
        >
          <View style={s.sheetHandle} />

          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>Filters</Text>
              <Text style={s.sheetSubtitle}>Refine your search · {count} buses match</Text>
            </View>
            <Pressable style={s.closeButton} onPress={onClose}>
              <Ionicons name="close" size={22} color={C.ink} />
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={s.filterScroll}
            contentContainerStyle={s.filterScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <FilterSection title="Bus type" icon="bus-outline" group="busTypes" values={BUS_TYPE_VALUES} selected={draft.busTypes} optionIcon={typeIcon} onToggle={toggle} />
            <FilterSection title="Departure time" icon="time-outline" group="departure" values={TIME_VALUES} selected={draft.departure} optionIcon={timeIcon} optionHint={label => TIME_HINTS[label]} onToggle={toggle} />
            <FilterSection title="Arrival time" icon="flag-outline" group="arrival" values={TIME_VALUES} selected={draft.arrival} optionIcon={timeIcon} optionHint={label => TIME_HINTS[label]} onToggle={toggle} />

            <View onLayout={e => { operatorY.current = e.nativeEvent.layout.y; }}>
            <View style={s.operatorSearch}>
              <Ionicons name="search-outline" size={17} color={C.muted} />
              <TextInput
                value={operatorSearch}
                onChangeText={setOperatorSearch}
                onFocus={() =>
                  setTimeout(() => scrollRef.current?.scrollTo({ y: operatorY.current, animated: true }), 200)
                }
                returnKeyType="done"
                placeholder="Search bus operator"
                placeholderTextColor={C.muted}
                style={s.operatorSearchInput}
              />
            </View>
            <FilterSection title="Operators" icon="business-outline" group="operators" values={operatorValues} selected={draft.operators} optionIcon={operatorIcon} onToggle={toggle} />
            </View>

            {amenities.length > 0 && (
              <FilterSection title="Amenities" icon="sparkles-outline" group="amenities" values={amenities} selected={draft.amenities} optionIcon={amenityIcon} onToggle={toggle} />
            )}
          </ScrollView>

          <View style={[s.filterFooter, { paddingBottom: keyboardTop != null ? 12 : 16 + insets.bottom }]}>
            <Pressable style={s.clearButton} onPress={() => setDraft(emptyFilters)}>
              <Text style={s.clearButtonText}>Clear all</Text>
            </Pressable>
            <Pressable style={s.applyButton} onPress={() => onApply(draft)}>
              <Text style={s.applyButtonText}>Show buses ({count})</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

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

/**
 * How much of a full-height container's bottom edge the keyboard actually covers.
 * Measured, not assumed: if Android already shrank the window for the keyboard the overlap is 0,
 * so nothing is lifted twice.
 */
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
  return { overlap, frame, measure };
}

/* ---------------------------------------------------------------- */
/* Read-only viewer of a bus's boarding and dropping points          */
/* ---------------------------------------------------------------- */
const PointsViewer = memo(function PointsViewer({
  bus,
  initialKind,
  from,
  to,
  onClose,
  isMobile,
}: {
  bus: Bus | null;
  initialKind: PointKind;
  from: string;
  to: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const backdropRef = useRef<View>(null);
  const keyboardTop = useKeyboardTop();
  const { overlap, frame, measure } = useKeyboardOverlap(backdropRef, keyboardTop);
  const availableHeight = frame.h > 0 ? frame.h : windowHeight;

  const [kind, setKind] = useState<PointKind>(initialKind);
  const [queries, setQueries] = useState<Record<PointKind, string>>({ boarding: '', dropping: '' });

  useEffect(() => {
    if (bus) {
      setKind(initialKind);
      setQueries({ boarding: '', dropping: '' });
    }
  }, [bus, initialKind]);

  const boardingItems = useMemo(() => buildItems(bus?.boardingDetails || [], 'boarding'), [bus]);
  const droppingItems = useMemo(() => buildItems(bus?.droppingDetails || [], 'dropping'), [bus]);

  const all = kind === 'boarding' ? boardingItems : droppingItems;
  const query = queries[kind];
  const items = useMemo(() => filterItems(all, query), [all, query]);

  return (
    <Modal visible={!!bus} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View ref={backdropRef} collapsable={false} onLayout={measure} style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            s.pointsSheet,
            !isMobile && s.filterSheetWide,
            {
              marginBottom: overlap || (isMobile ? 0 : 20),
              height: Math.max(320, (availableHeight - overlap) * 0.82),
            },
          ]}
        >
          <View style={s.sheetHandle} />

          <View style={s.sheetHeader}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <Text style={s.sheetTitle} numberOfLines={1}>{bus?.operator_Name || 'Bus operator'}</Text>
              <Text style={s.sheetSubtitle} numberOfLines={1}>{from} → {to}</Text>
            </View>
            <Pressable style={s.closeButton} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>

          <View style={s.viewerTabs}>
            {(['boarding', 'dropping'] as PointKind[]).map(k => {
              const active = kind === k;
              const count = k === 'boarding' ? boardingItems.length : droppingItems.length;
              return (
                <Pressable key={k} onPress={() => setKind(k)} style={[s.viewerTab, active && s.viewerTabActive]}>
                  <Text style={[s.viewerTabText, active && s.viewerTabTextActive]}>
                    {k === 'boarding' ? 'Boarding' : 'Dropping'}
                  </Text>
                  <Text style={[s.viewerTabCount, active && s.viewerTabTextActive]}>{count}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.viewerSearch}>
            <Ionicons name="search-outline" size={17} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={text => setQueries(current => ({ ...current, [kind]: text }))}
              placeholder={kind === 'boarding' ? 'Search boarding points' : 'Search dropping points'}
              placeholderTextColor={C.muted}
              style={s.viewerSearchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!query && (
              <Pressable onPress={() => setQueries(current => ({ ...current, [kind]: '' }))} hitSlop={10}>
                <Ionicons name="close-circle" size={17} color="#C9BDB4" />
              </Pressable>
            )}
          </View>

          <FlatList
            data={items}
            keyExtractor={(item: PointItem) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.viewerList, { paddingBottom: 18 + (keyboardTop != null ? 0 : insets.bottom) }]}
            ItemSeparatorComponent={() => <View style={s.viewerDivider} />}
            ListEmptyComponent={
              <Text style={s.viewerEmpty}>
                {query.trim() ? `No ${kind} points match "${query.trim()}".` : `No ${kind} points listed.`}
              </Text>
            }
            renderItem={({ item }: { item: PointItem }) => (
              <View style={s.viewerRow}>
                <View style={s.viewerPin}>
                  <Ionicons
                    name={kind === 'boarding' ? 'location-outline' : 'flag-outline'}
                    size={15}
                    color={C.burgundy}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.viewerName}>{item.name}</Text>
                  {!!item.address && <Text style={s.viewerAddress}>{item.address}</Text>}
                  {item.notes.map(note => (
                    <View key={note.text} style={s.viewerNote}>
                      <Ionicons name={note.icon} size={13} color="#B3924F" />
                      <Text style={s.viewerNoteText}>{note.text}</Text>
                    </View>
                  ))}
                </View>
                {!!item.time && <Text style={s.viewerTime}>{item.time}</Text>}
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});

/** Calm full-screen loader: a title, one line of context and a thin progress bar. No illustration. */
function OpeningLoader({ visible, title, subtitle }: { visible: boolean; title: string; subtitle?: string }) {
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
      <View style={s.loaderScreen}>
        <Text style={s.loaderTitle}>{title}</Text>
        {!!subtitle && <Text style={s.loaderSubtitle} numberOfLines={2}>{subtitle}</Text>}
        <View style={s.loaderTrack}>
          <Animated.View
            style={[
              s.loaderFill,
              { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-95, 95] }) }] },
            ]}
          />
        </View>
      </View>
    </Modal>
  );
}

function Separator() {
  return <View style={s.listSeparator} />;
}

export default function Results() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    response?: string | string[];
    date?: string | string[];
    from?: string | string[];
    to?: string | string[];
    fromCityId?: string | string[];
    toCityId?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 640;

  // The route can now be changed from the Edit sheet, so it lives in state.
  const [route, setRoute] = useState<SearchRoute>(() => ({
    from: readRouteString(routeParams.from) || 'Departure',
    to: readRouteString(routeParams.to) || 'Destination',
    fromCityId: readRouteString(routeParams.fromCityId),
    toCityId: readRouteString(routeParams.toCityId),
  }));
  const { from, to, fromCityId, toCityId } = route;

  // Parse ONCE (lazy initializer). The old code re-parsed the whole response on every render.
  // Home now hands the response over through resultsCache; the route param is only a fallback.
  const [initialResponse] = useState(() => {
    const legacy = readRouteString(routeParams.response);
    return legacy ? parseRouteResponse(legacy) : (getSearchResponse() ?? {});
  });

  const [buses, setBuses] = useState<Bus[]>(
    Array.isArray(initialResponse.buses) ? initialResponse.buses : []
  );
  const [searchKey, setSearchKey] = useState(initialResponse.search_Key);
  const [journeyDate, setJourneyDate] = useState(readRouteString(routeParams.date));

  const [sort, setSort] = useState<Sort>('Recommended');
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);

  // Boarding / dropping points viewer
  const [pointsView, setPointsView] = useState<{ bus: Bus; kind: PointKind } | null>(null);
  const viewPoints = useCallback((bus: Bus, kind: PointKind) => setPointsView({ bus, kind }), []);
  const closePoints = useCallback(() => setPointsView(null), []);

  // Opening the seat screen
  const [openingSeats, setOpeningSeats] = useState(false);
  const [openingLabel, setOpeningLabel] = useState('');
  const openingRef = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Date calendar state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(journeyDate);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = journeyDate ? new Date(`${journeyDate}T00:00:00`) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const [searchingDate, setSearchingDate] = useState(false);
  // Shown inside the date sheet (a toast would sit behind this modal).
  const [dateError, setDateError] = useState('');

  const todayKey = dateKey(new Date());
  const maxDate = new Date(
    new Date().getFullYear() + 1,
    new Date().getMonth(),
    new Date().getDate()
  );
  const maxDateKey = dateKey(maxDate);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  const monthTitle = calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const isFirstMonth =
    calendarMonth.getFullYear() === new Date().getFullYear() &&
    calendarMonth.getMonth() === new Date().getMonth();

  const isLastMonth =
    calendarMonth.getFullYear() === maxDate.getFullYear() &&
    calendarMonth.getMonth() === maxDate.getMonth();

  const openDatePicker = () => {
    pendingRouteRef.current = null;
    const current = journeyDate ? new Date(`${journeyDate}T00:00:00`) : new Date();
    setSelectedDate(journeyDate || todayKey);
    setCalendarMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setDateError('');
    setShowDatePicker(true);
  };

  const changeMonth = (amount: number) => {
    setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const selectDate = (value: string) => {
    if (value < todayKey || value > maxDateKey) return;
    setDateError('');
    setSelectedDate(value);
  };

  // Cities chosen in the Edit sheet before jumping to the full calendar.
  const pendingRouteRef = useRef<SearchRoute | null>(null);

  const searchForSelectedDate = async () => {
    const target = pendingRouteRef.current ?? route;
    const fromCityId = target.fromCityId;
    const toCityId = target.toCityId;
    if (!fromCityId || !toCityId) {
      setDateError('Something is missing from this search. Please go back to Home and search again.');
      return;
    }
    if (!selectedDate) return;

    setSearchingDate(true);
    setDateError('');
    try {
      const [year, month, day] = selectedDate.split('-');
      const travel_date = `${month}/${day}/${year}`;

      const response = await searchApi.buses({
        from_city: String(fromCityId),
        to_city: String(toCityId),
        travel_date,
      });

      setBuses(Array.isArray(response?.buses) ? response.buses : []);
      setSearchKey(response?.search_Key);
      setJourneyDate(selectedDate);
      setShowDatePicker(false);

      // Only the small params are updated; the big response stays in state.
      if (pendingRouteRef.current) setRoute(pendingRouteRef.current);
      pendingRouteRef.current = null;
      router.setParams({ date: selectedDate, ...target });

      setSort('Recommended');
      setAppliedFilters(emptyFilters);
      setShowSort(false);
    } catch (error: any) {
      setDateError(error?.message || "We couldn't search buses just now. Please try again.");
    } finally {
      setSearchingDate(false);
    }
  };

  /* ---- Edit sheet: change cities and date without leaving this screen ---- */

  const [showEdit, setShowEdit] = useState(false);
  const [editView, setEditView] = useState<'main' | 'from' | 'to'>('main');
  const [editFrom, setEditFrom] = useState<EditCity | null>(null);
  const [editTo, setEditTo] = useState<EditCity | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editError, setEditError] = useState('');
  const [editSearching, setEditSearching] = useState(false);
  const [editLoader, setEditLoader] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityList, setCityList] = useState<EditCity[]>(citiesMemory ?? []);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const loadCities = useCallback(async () => {
    if (citiesMemory?.length) {
      setCityList(citiesMemory);
      return;
    }
    setCitiesLoading(true);
    try {
      const response: any = await searchApi.cities();
      const list: EditCity[] = Array.isArray(response?.cityDetails) ? response.cityDetails : [];
      citiesMemory = list;
      setCityList(list);
    } catch {
      setEditError("We couldn't load the cities. Please try again.");
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  const openEdit = () => {
    setEditFrom({ cityID: fromCityId, cityName: from });
    setEditTo({ cityID: toCityId, cityName: to });
    setEditDate(journeyDate || todayKey);
    setEditView('main');
    setCityQuery('');
    setEditError('');
    setShowEdit(true);
    loadCities();
  };

  const swapEditCities = () => {
    setEditFrom(editTo);
    setEditTo(editFrom);
    setEditError('');
  };

  const pickEditCity = (city: EditCity) => {
    setEditError('');
    if (editView === 'from') {
      // Picking the city that is already the destination swaps the two.
      if (editTo && String(editTo.cityID) === String(city.cityID)) setEditTo(editFrom);
      setEditFrom(city);
    } else {
      if (editFrom && String(editFrom.cityID) === String(city.cityID)) setEditFrom(editTo);
      setEditTo(city);
    }
    setCityQuery('');
    setEditView('main');
  };

  const quickDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dateKey(new Date(Date.now() + i * 86400000))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey]
  );

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const list = q ? cityList.filter(c => c.cityName.toLowerCase().includes(q)) : cityList;
    return list.slice(0, 80);
  }, [cityList, cityQuery]);

  const openCalendarFromEdit = () => {
    if (!editFrom || !editTo) return;
    pendingRouteRef.current = {
      from: editFrom.cityName,
      to: editTo.cityName,
      fromCityId: String(editFrom.cityID),
      toCityId: String(editTo.cityID),
    };
    const current = editDate ? new Date(`${editDate}T00:00:00`) : new Date();
    setSelectedDate(editDate || todayKey);
    setCalendarMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setDateError('');
    setShowEdit(false);
    setTimeout(() => setShowDatePicker(true), 260);
  };

  const searchFromEdit = async () => {
    if (!editFrom || !editTo || editSearching) return;
    if (String(editFrom.cityID) === String(editTo.cityID)) {
      setEditError('Departure and destination cannot be the same city.');
      return;
    }
    setEditSearching(true);
    setEditError('');
    // Close the sheet and show the full-screen loader (after the sheet has slid away).
    setShowEdit(false);
    const loaderTimer = setTimeout(() => setEditLoader(true), 280);
    try {
      const [year, month, day] = editDate.split('-');
      const response = await searchApi.buses({
        from_city: String(editFrom.cityID),
        to_city: String(editTo.cityID),
        travel_date: `${month}/${day}/${year}`,
      });
      const next: SearchRoute = {
        from: editFrom.cityName,
        to: editTo.cityName,
        fromCityId: String(editFrom.cityID),
        toCityId: String(editTo.cityID),
      };
      setBuses(Array.isArray(response?.buses) ? response.buses : []);
      setSearchKey(response?.search_Key);
      setJourneyDate(editDate);
      setRoute(next);
      router.setParams({ date: editDate, ...next });
      setSort('Recommended');
      setAppliedFilters(emptyFilters);
      setShowSort(false);
    } catch (error: any) {
      // Bring the sheet back with the reason, so nothing typed is lost.
      setEditError(error?.message || "We couldn't search buses just now. Please try again.");
      setTimeout(() => setShowEdit(true), 320);
    } finally {
      clearTimeout(loaderTimer);
      setEditLoader(false);
      setEditSearching(false);
    }
  };

  /* ---- derived data, each computed only when its inputs change ---- */
  const rows = useMemo(() => buildRows(buses), [buses]);
  const operators = useMemo(() => unique(rows.map(r => r.operator).filter(Boolean)), [rows]);
  const amenities = useMemo(() => unique(rows.flatMap(r => r.amenities)), [rows]);

  const filteredRows = useMemo(() => {
    const result = filterRows(rows, appliedFilters);
    if (sort === 'Early departure') {
      result.sort((a, b) => (a.depMin ?? Infinity) - (b.depMin ?? Infinity));
    } else if (sort === 'Late departure') {
      result.sort((a, b) => (b.depMin ?? -Infinity) - (a.depMin ?? -Infinity));
    } else if (sort === 'Price: low to high') {
      result.sort((a, b) => a.fare - b.fare);
    } else if (sort === 'Price: high to low') {
      result.sort((a, b) => b.fare - a.fare);
    } else if (sort === 'Highest rated') {
      result.sort((a, b) => b.rating - a.rating);
    }
    return result;
  }, [rows, appliedFilters, sort]);

  // Bus-type picks are already visible as chips next to the button, so they are not counted here.
  const hasRatings = useMemo(() => rows.some(r => r.rating > 0), [rows]);
  const sortChoices = useMemo(
    () => (hasRatings ? sortOptions : sortOptions.filter(item => item !== 'Highest rated')),
    [hasRatings]
  );

  const activeFilterCount =
    appliedFilters.departure.length +
    appliedFilters.arrival.length +
    appliedFilters.operators.length +
    appliedFilters.amenities.length;

  const closeFilters = useCallback(() => setShowFilters(false), []);
  const applyFilters = useCallback((filters: FilterState) => {
    setAppliedFilters(filters);
    setShowFilters(false);
  }, []);

  const clearFilters = () => {
    setAppliedFilters(emptyFilters);
    setSort('Recommended');
  };

  // Quick chips share state with the Bus type section of the filter sheet; any number can be on.
  const toggleQuick = useCallback((item: string) => {
    setAppliedFilters(current => ({ ...current, busTypes: toggleValue(current.busTypes, item) }));
  }, []);

  /* ---- open seats with a full-screen loader ---- */
  const openBus = useCallback(
    (bus: Bus) => {
      if (openingRef.current) return; // ignore double taps
      openingRef.current = true;
      setOpeningLabel(bus.operator_Name || '');
      setOpeningSeats(true);

      // Let the loader paint first, then navigate.
      setTimeout(() => {
        router.push({
          pathname: '/seats',
          params: {
            bus: JSON.stringify(bus),
            searchKey: searchKey == null ? '' : String(searchKey),
            busKey: bus.bus_Key == null ? '' : String(bus.bus_Key),
            from,
            to,
            fromCityId,
            toCityId,
            date: journeyDate,
            boardingDetails: JSON.stringify(bus.boardingDetails || []),
            droppingDetails: JSON.stringify(bus.droppingDetails || []),
            dropPointMandatory: String(Boolean(bus.dropPoint_Mandatory)),
          },
        });
        // Safety net in case navigation never leaves this screen.
        fallbackTimer.current = setTimeout(() => {
          openingRef.current = false;
          setOpeningSeats(false);
        }, 30000);
      }, 80);
    },
    [router, searchKey, from, to, fromCityId, toCityId, journeyDate]
  );

  // Hide the loader once this screen has actually been left; reset when we come back.
  useFocusEffect(
    useCallback(() => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      openingRef.current = false;
      setOpeningSeats(false);
      return () => {
        if (openingRef.current) {
          setTimeout(() => setOpeningSeats(false), 600);
        }
      };
    }, [])
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <BusCard row={item} from={from} to={to} onPress={openBus} onViewPoints={viewPoints} />
    ),
    [from, to, openBus, viewPoints]
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);

  const listHeader = (
    <View>
      {/* SUMMARY */}
      <View style={s.summary}>
        <View>
          <Text style={s.pageTitle}>Available buses</Text>
          <Text style={s.resultCount}>
            {filteredRows.length} of {rows.length} buses
          </Text>
        </View>

        <Pressable style={s.dateBadge} onPress={openDatePicker}>
          <Ionicons name="calendar-outline" size={15} color={C.burgundy} />
          <Text style={s.dateBadgeText}>{formatJourneyDate(journeyDate)}</Text>
          <Ionicons name="chevron-down" size={13} color={C.burgundy} />
        </Pressable>
      </View>

      {/* FILTERS AND SORT */}
      <View style={s.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={[s.filterButton, activeFilterCount > 0 && s.filterButtonActive]}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={C.burgundy}
            />
            <Text style={[s.filterButtonText, activeFilterCount > 0 && s.filterButtonTextActive]}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </Pressable>

          <Pressable style={s.sortButton} onPress={() => setShowSort(true)}>
            <Ionicons name="swap-vertical-outline" size={18} color={C.burgundy} />
            <Text style={s.sortButtonText}>Sort</Text>
            <Ionicons name="chevron-down" size={14} color={C.muted} />
          </Pressable>

          <View style={s.controlsDivider} />

          {QUICK_TYPES.map(item => {
            const active = appliedFilters.busTypes.includes(item);
            return (
              <Pressable
                key={item}
                onPress={() => toggleQuick(item)}
                style={[s.filterChip, active && s.filterChipActive]}
              >
                <Ionicons
                  name={TYPE_ICONS[item]}
                  size={16}
                  color={C.burgundy}
                />
                <Text style={[s.filterText, active && s.filterTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {sort !== 'Recommended' && (
        <View style={s.sortLabel}>
          <Text style={s.sortLabelText}>Sorted by {sort.toLowerCase()}</Text>
          <Pressable onPress={() => setSort('Recommended')} hitSlop={12}>
            <Text style={s.clearSort}>Reset</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const listEmpty =
    rows.length === 0 ? (
      <View style={s.emptyCard}>
        <View style={s.emptyIcon}>
          <Ionicons name="bus-outline" size={31} color={C.burgundy} />
        </View>
        <Text style={s.emptyTitle}>No buses found</Text>
        <Text style={s.emptySubtitle}>
          There are no buses available for this route and date. Try changing your journey date.
        </Text>
        <Pressable style={s.backHomeButton} onPress={openDatePicker}>
          <Text style={s.backHomeText}>Change travel date</Text>
        </Pressable>
      </View>
    ) : (
      <View style={s.emptyCard}>
        <Text style={s.emptyTitle}>No matching buses</Text>
        <Text style={s.emptySubtitle}>Try changing or clearing your filters.</Text>
        <Pressable style={s.backHomeButton} onPress={clearFilters}>
          <Text style={s.backHomeText}>Clear filters</Text>
        </Pressable>
      </View>
    );

  const listFooter = (
    <View style={s.bottomNote}>
      <Ionicons name="information-circle-outline" size={15} color={C.muted} />
      <Text style={s.bottomNoteText}>
        Fares and seat availability are provided by the bus operator.
      </Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* ROUTE HEADER */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={[s.headerInner, !isMobile && s.wide]}>
          <Pressable style={s.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={21} color={C.ink} />
          </Pressable>

          <View style={s.headerRoute}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {from} <Text style={s.routeArrow}>→</Text> {to}
            </Text>
            <Text style={s.headerDate}>{formatJourneyDate(journeyDate)}</Text>
          </View>

          <Pressable style={s.editButton} onPress={openEdit}>
            <Ionicons name="create-outline" size={18} color={C.burgundy} />
            <Text style={s.editText}>Edit</Text>
          </Pressable>
        </View>
      </View>

      {/* Virtualized list: only the cards near the screen are rendered */}
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <FlatList
        data={filteredRows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchSize={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, !isMobile && s.wide]}
      />
      </View>

      {/* SORT SHEET */}
      <Modal
        visible={showSort}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowSort(false)}
      >
        <View style={s.sortBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSort(false)} />
          <View style={[s.sortSheet, !isMobile && s.sortSheetWide, { paddingBottom: 18 + insets.bottom }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sortSheetTitle}>Sort by</Text>
            {sortChoices.map(item => (
              <Pressable
                key={item}
                style={s.sortOption}
                onPress={() => {
                  setSort(item);
                  setShowSort(false);
                }}
              >
                <Text style={[s.sortOptionText, sort === item && s.sortOptionSelected]}>
                  {item}
                </Text>
                {sort === item && <Ionicons name="checkmark" size={20} color={C.burgundy} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* EDIT SEARCH SHEET */}
      <Modal
        visible={showEdit}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => (editView === 'main' ? setShowEdit(false) : setEditView('main'))}
      >
        <View style={s.sortBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEdit(false)} />
          <View
            style={[
              s.editSheet,
              !isMobile && s.sortSheetWide,
              editView !== 'main' && { height: '72%' },
              { paddingBottom: 18 + insets.bottom },
            ]}
          >
            <View style={s.sheetHandle} />

            {editView === 'main' ? (
              <>
                <View style={s.editHeader}>
                  <View>
                    <Text style={s.sortSheetTitle}>Edit search</Text>
                    <Text style={s.editSubtitle}>Change your cities or travel date</Text>
                  </View>
                  <Pressable style={s.closeButton} onPress={() => setShowEdit(false)}>
                    <Ionicons name="close" size={20} color={C.ink} />
                  </Pressable>
                </View>

                <View style={s.editRoute}>
                  <Pressable style={s.editField} onPress={() => { setEditView('from'); setCityQuery(''); }}>
                    <Ionicons name="radio-button-on" size={17} color={C.burgundy} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.editFieldLabel}>From</Text>
                      <Text style={s.editFieldValue} numberOfLines={1}>{editFrom?.cityName || 'Select city'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </Pressable>

                  <View style={s.editDivider}>
                    <View style={s.editDividerLine} />
                    <Pressable style={s.swapButton} onPress={swapEditCities} hitSlop={8} accessibilityLabel="Swap cities">
                      <Ionicons name="swap-vertical" size={18} color={C.burgundy} />
                    </Pressable>
                  </View>

                  <Pressable style={s.editField} onPress={() => { setEditView('to'); setCityQuery(''); }}>
                    <Ionicons name="location" size={17} color={C.burgundy} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.editFieldLabel}>To</Text>
                      <Text style={s.editFieldValue} numberOfLines={1}>{editTo?.cityName || 'Select city'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </Pressable>
                </View>

                <Text style={s.editLabel}>Travel date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dateChipRow}>
                  {quickDates.map((value, index) => {
                    const d = new Date(`${value}T00:00:00`);
                    const on = editDate === value;
                    return (
                      <Pressable key={value} style={[s.dateChip, on && s.dateChipOn]} onPress={() => { setEditDate(value); setEditError(''); }}>
                        <Text style={[s.dateChipTop, on && s.dateChipTextOn]}>
                          {index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
                        </Text>
                        <Text style={[s.dateChipDay, on && s.dateChipTextOn]}>
                          {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={[s.dateChip, !quickDates.includes(editDate) && s.dateChipOn]} onPress={openCalendarFromEdit}>
                    <Ionicons name="calendar-outline" size={18} color={!quickDates.includes(editDate) ? C.white : C.burgundy} />
                    <Text style={[s.dateChipTop, !quickDates.includes(editDate) && s.dateChipTextOn]}>
                      {!quickDates.includes(editDate) ? formatJourneyDate(editDate).replace(/^\w+, /, '').replace(/,?\s\d{4}$/, '') : 'More'}
                    </Text>
                  </Pressable>
                </ScrollView>

                {!!editError && (
                  <View style={s.dateErrorRow}>
                    <Ionicons name="information-circle-outline" size={16} color={C.burgundy} />
                    <Text style={s.dateErrorText}>{editError}</Text>
                  </View>
                )}

                <Pressable
                  style={[s.searchDateButton, (editSearching || !editFrom || !editTo) && s.searchDateButtonDisabled]}
                  disabled={editSearching || !editFrom || !editTo}
                  onPress={searchFromEdit}
                >
                  {editSearching ? (
                    <>
                      <ActivityIndicator color={C.white} size="small" />
                      <Text style={s.searchDateButtonText}>Searching buses...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={17} color={C.white} />
                      <Text style={s.searchDateButtonText}>Update search</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={s.editHeader}>
                  <Pressable style={s.closeButton} onPress={() => setEditView('main')}>
                    <Ionicons name="arrow-back" size={20} color={C.ink} />
                  </Pressable>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.sortSheetTitle}>{editView === 'from' ? 'Departure city' : 'Destination city'}</Text>
                  </View>
                </View>
                <View style={s.citySearch}>
                  <Ionicons name="search-outline" size={18} color={C.muted} />
                  <TextInput
                    value={cityQuery}
                    onChangeText={setCityQuery}
                    placeholder="Search city"
                    placeholderTextColor="#A99B94"
                    style={s.citySearchInput}
                    autoFocus
                  />
                  {!!cityQuery && (
                    <Pressable onPress={() => setCityQuery('')} hitSlop={10}>
                      <Ionicons name="close-circle" size={18} color={C.muted} />
                    </Pressable>
                  )}
                </View>
                {citiesLoading ? (
                  <ActivityIndicator color={C.burgundy} style={{ marginTop: 30 }} />
                ) : (
                  <FlatList
                    data={filteredCities}
                    keyExtractor={c => `${c.cityID}-${c.cityName}`}
                    keyboardShouldPersistTaps="always"
                    renderItem={({ item }) => (
                      <Pressable style={s.cityRow} onPress={() => pickEditCity(item)}>
                        <Ionicons name="location-outline" size={17} color={C.muted} />
                        <Text style={s.cityRowText}>{item.cityName}</Text>
                      </Pressable>
                    )}
                    ListEmptyComponent={<Text style={s.cityEmpty}>No cities found.</Text>}
                  />
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* DATE PICKER */}
      <Modal
        visible={showDatePicker}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={[s.dateBackdrop, { paddingTop: 18 + insets.top, paddingBottom: 18 + insets.bottom }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowDatePicker(false)}
          />

          <View style={[s.calendarCard, !isMobile && s.calendarCardWide]}>
            <View style={s.calendarHeader}>
              <View>
                <Text style={s.calendarTitle}>Choose travel date</Text>
                <Text style={s.calendarSubtitle}>
                  Select a date for your journey
                </Text>
              </View>
              <Pressable
                style={s.closeButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Ionicons name="close" size={20} color={C.ink} />
              </Pressable>
            </View>

            <View style={s.monthNavigation}>
              <Pressable
                style={[s.monthArrow, isFirstMonth && s.disabledArrow]}
                disabled={isFirstMonth}
                onPress={() => changeMonth(-1)}
              >
                <Ionicons name="chevron-back" size={18} color={C.ink} />
              </Pressable>

              <Text style={s.monthTitle}>{monthTitle}</Text>

              <Pressable
                style={[s.monthArrow, isLastMonth && s.disabledArrow]}
                disabled={isLastMonth}
                onPress={() => changeMonth(1)}
              >
                <Ionicons name="chevron-forward" size={18} color={C.ink} />
              </Pressable>
            </View>

            <View style={s.calendarGrid}>
              {weekdays.map((day, index) => (
                <View key={`${day}-${index}`} style={s.calendarCell}>
                  <Text style={s.weekdayText}>{day}</Text>
                </View>
              ))}

              {calendarDays.map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={s.calendarCell} />;
                }

                const value = dateKey(new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  day
                ));
                const disabled = value < todayKey || value > maxDateKey;
                const selected = selectedDate === value;

                return (
                  <Pressable
                    key={value}
                    disabled={disabled}
                    onPress={() => selectDate(value)}
                    style={[
                      s.calendarCell,
                      s.calendarDay,
                      selected && s.calendarDaySelected,
                      disabled && s.calendarDayDisabled,
                    ]}
                  >
                    <Text style={[
                      s.calendarDayText,
                      selected && s.calendarDayTextSelected,
                      disabled && s.calendarDayTextDisabled,
                    ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.selectedDateRow}>
              <Ionicons name="calendar-outline" size={16} color={C.burgundy} />
              <Text style={s.selectedDateText}>
                {selectedDate ? formatJourneyDate(selectedDate) : 'Select a date'}
              </Text>
            </View>

            {!!dateError && (
              <View style={s.dateErrorRow}>
                <Ionicons name="information-circle-outline" size={16} color={C.burgundy} />
                <Text style={s.dateErrorText}>{dateError}</Text>
              </View>
            )}

            <Pressable
              style={[
                s.searchDateButton,
                (searchingDate || !selectedDate) && s.searchDateButtonDisabled,
              ]}
              disabled={searchingDate || !selectedDate}
              onPress={searchForSelectedDate}
            >
              {searchingDate ? (
                <>
                  <ActivityIndicator color={C.white} size="small" />
                  <Text style={s.searchDateButtonText}>Searching buses...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={17} color={C.white} />
                  <Text style={s.searchDateButtonText}>Search buses</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* FILTER SHEET */}
      <FilterSheet
        visible={showFilters}
        onClose={closeFilters}
        onApply={applyFilters}
        rows={rows}
        applied={appliedFilters}
        operators={operators}
        amenities={amenities}
        isMobile={isMobile}
      />

      <PointsViewer
        bus={pointsView?.bus ?? null}
        initialKind={pointsView?.kind ?? 'boarding'}
        from={from}
        to={to}
        onClose={closePoints}
        isMobile={isMobile}
      />

      {/* FULL-SCREEN LOADER WHILE THE EDITED SEARCH RUNS */}
      <OpeningLoader
        visible={editLoader}
        title="Finding buses"
        subtitle={editFrom && editTo ? `${editFrom.cityName} → ${editTo.cityName}` : undefined}
      />

      {/* FULL-SCREEN LOADER WHILE OPENING SEATS */}
      <OpeningLoader
        visible={openingSeats}
        title="Opening your seats"
        subtitle={openingLabel}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wide: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },

  header: {
    backgroundColor: C.bg,
  },
  headerInner: {
    height: 65,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  headerRoute: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '400', color: C.ink },
  routeArrow: { color: C.burgundy },
  headerDate: { fontSize: 12, color: C.muted, marginTop: 3 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
  },
  editText: { fontSize: 13, color: C.burgundy, fontWeight: '400' },

  scroll: { paddingHorizontal: 13, paddingTop: 15, paddingBottom: 35 },
  content: { width: '100%' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pageTitle: { fontSize: 19, fontWeight: '400', color: C.ink },
  resultCount: { fontSize: 12, color: C.muted, marginTop: 4 },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
  },
  dateBadgeText: { fontSize: 12, color: C.burgundy, fontWeight: '400' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 13,
    zIndex: 20,
  },
  quickFilterScroll: { flex: 1, minWidth: 0 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 13,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  filterChipActive: { backgroundColor: C.burgundyLight, borderColor: '#DDBFC5' },
  filterText: { fontSize: 13, color: C.muted, fontWeight: '400' },
  filterTextActive: { color: C.burgundy, fontWeight: '500' },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    height: 44,
    justifyContent: 'center',
  },
  filterButtonActive: { backgroundColor: C.burgundyLight, borderColor: '#DDBFC5' },
  filterButtonText: { fontSize: 13, color: C.ink, fontWeight: '500' },
  filterButtonTextActive: { color: C.burgundy },

  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    height: 44,
    justifyContent: 'center',
  },
  sortButtonText: { fontSize: 13, color: C.ink, fontWeight: '500' },
  sortOption: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sortOptionText: { fontSize: 15, color: C.muted },
  sortOptionSelected: { color: C.burgundy, fontWeight: '500' },
  sortLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sortLabelText: { fontSize: 12, color: C.muted },
  clearSort: { fontSize: 13, color: C.burgundy, fontWeight: '500' },

  busList: { gap: 9 },
  busCard: {
    backgroundColor: C.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#783D4A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  busTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 9,
  },
  operatorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  busIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorText: { flex: 1, minWidth: 0 },
  operatorName: { fontSize: 15, fontWeight: '500', color: C.burgundy },
  busType: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  fareBlock: { alignItems: 'flex-end', minWidth: 85 },
  fareCaption: { fontSize: 10, color: C.muted },
  fareValue: {
    fontSize: 17,
    fontWeight: '500',
    color: C.burgundy,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  ratingText: { fontSize: 11, color: C.muted, fontWeight: '500' },
  ratingCount: { fontSize: 11, color: C.muted, fontWeight: '400' },

  features: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 8, marginTop: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  featureText: { fontSize: 13.5, color: C.ink, maxWidth: 130 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F3EFE9',
  },
  typeTagText: {
    fontSize: 11.5,
    color: C.muted,
    fontWeight: '400',
      },
  cardDivider: { height: 1, backgroundColor: C.border, marginVertical: 7 },

  journeySection: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
  },
  timelineColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 68,
    paddingVertical: 2,
  },
  timelineStops: { flex: 1, justifyContent: 'space-between', minWidth: 0 },
  timelineStop: { flex: 1, justifyContent: 'center', paddingVertical: 1 },
  timeValue: {
    fontSize: 16,
    fontWeight: '500',
    color: C.ink,
    
  },
  timeCaption: { fontSize: 12, color: C.muted, marginTop: 2, maxWidth: 160 },
  timelineTrack: {
    width: 18,
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 5,
    marginRight: 8,
  },
  timelineCircle: {
    width: 8,
    height: 8,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.burgundy,
    backgroundColor: C.paper,
    zIndex: 1,
  },
  timelineCircleEnd: { backgroundColor: C.burgundy },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#DCCBC3',
    marginVertical: 2,
  },
  durationBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 75,
    paddingLeft: 6,
  },
  durationText: { fontSize: 14, color: C.ink, fontWeight: '500' },
  durationCaption: {
    fontSize: 10,
    color: C.muted,
    marginTop: 4,
    textAlign: 'right',
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 3,
  },
  seatCount: { fontSize: 12, color: C.muted },

  emptyCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 26,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: C.ink },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: C.muted,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 270,
  },
  backHomeButton: {
    marginTop: 17,
    backgroundColor: C.burgundy,
    borderRadius: 10,
    paddingHorizontal: 17,
    paddingVertical: 14,
  },
  backHomeText: { color: C.white, fontSize: 13, fontWeight: '500' },
  bottomNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  bottomNoteText: { fontSize: 11, color: C.muted },

  // Date calendar
  dateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(35, 27, 25, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: C.paper,
    borderRadius: 20,
    padding: 18,
  },
  calendarCardWide: { maxWidth: 420 },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarTitle: { fontSize: 18, fontWeight: '500', color: C.ink },
  calendarSubtitle: { fontSize: 12, color: C.muted, marginTop: 4 },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 12,
  },
  monthArrow: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledArrow: { opacity: 0.3 },
  monthTitle: { fontSize: 15, fontWeight: '500', color: C.burgundy },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: '14.2857%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: { fontSize: 12, color: C.muted, fontWeight: '500' },
  calendarDay: { borderRadius: 12 },
  calendarDaySelected: { backgroundColor: C.burgundy },
  calendarDayDisabled: { opacity: 0.3 },
  calendarDayText: { fontSize: 14, color: C.ink, fontWeight: '500' },
  calendarDayTextSelected: { color: C.white, fontWeight: '500' },
  calendarDayTextDisabled: { color: '#B8ADA5' },
  selectedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.burgundyLight,
    borderRadius: 10,
    padding: 11,
    marginTop: 15,
  },
  selectedDateText: { fontSize: 13, color: C.burgundy, fontWeight: '500' },
  dateErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, paddingHorizontal: 2 },
  dateErrorText: { flex: 1, color: C.burgundy, fontSize: 13, lineHeight: 19 },
  searchDateButton: {
    height: 52,
    borderRadius: 11,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 13,
  },
  searchDateButtonDisabled: { opacity: 0.65 },
  searchDateButtonText: { color: C.white, fontSize: 14, fontWeight: '500' },

  // Filter modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(35, 27, 25, 0.3)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    maxHeight: '90%',
    paddingTop: 9,
    overflow: 'hidden',
  },
  filterSheetWide: {
    width: 560,
    alignSelf: 'center',
    borderRadius: 22,
    maxHeight: '88%',
    marginBottom: 20,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 5,
    backgroundColor: '#D9D0C8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: { fontSize: 19, fontWeight: '400', color: C.ink },
  sheetSubtitle: { fontSize: 12, color: C.muted, marginTop: 3 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterScroll: { flexShrink: 1 },
  filterScrollContent: { paddingHorizontal: 20, paddingBottom: 18 },
  filterSection: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  filterSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  filterSectionTitle: { fontSize: 14, fontWeight: '500', color: C.ink },
  optionHint: { fontSize: 11, color: C.muted, marginTop: 2 },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 15,
    rowGap: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '47%',
    minHeight: 44,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CFC3B9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  optionText: { fontSize: 13, color: C.ink },
  unavailableText: { fontSize: 12, color: C.muted, lineHeight: 16 },
  operatorSearch: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    marginBottom: 12,
  },
  operatorSearchInput: { flex: 1, fontSize: 13, color: C.ink, paddingVertical: 0 },
  filterFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.paper,
  },
  clearButton: {
    flex: 1,
    height: 52,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.paper,
  },
  clearButtonText: { fontSize: 14, fontWeight: '500', color: C.burgundy },
  applyButton: {
    flex: 1.5,
    height: 52,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.burgundy,
  },
  applyButtonText: { fontSize: 14, fontWeight: '500', color: C.white },
  loaderScreen: { flex: 1, backgroundColor: '#F8F4ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  loaderTitle: { color: '#382B28', fontSize: 20, fontWeight: '500',  textAlign: 'center' },
  loaderSubtitle: { color: '#887A73', fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  loaderTrack: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  loaderFill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },
  controlsDivider: { width: 1, height: 24, backgroundColor: C.border, marginHorizontal: 2 },
  listSeparator: { height: 10 },

  pointsLink: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointsLinkText: { flex: 1, color: C.burgundy, fontSize: 13 },

  pointsSheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 9,
    overflow: 'hidden',
  },
  viewerTabs: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(120, 61, 74, 0.06)',
  },
  viewerTab: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewerTabActive: { backgroundColor: C.paper },
  viewerTabText: { color: C.muted, fontSize: 13.5 },
  viewerTabTextActive: { color: C.burgundy },
  viewerTabCount: { color: C.muted, fontSize: 12 },
  viewerSearch: {
    height: 44,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  viewerSearchInput: { flex: 1, color: C.ink, fontSize: 14, paddingVertical: 0 },
  viewerList: { paddingHorizontal: 20, paddingTop: 8 },
  viewerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  viewerPin: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerName: { color: C.ink, fontSize: 14.5, fontWeight: '500' },
  viewerAddress: { color: C.muted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  viewerTime: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  viewerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  viewerNoteText: { flex: 1, color: '#7A6643', fontSize: 12 },
  viewerDivider: { height: 1, backgroundColor: C.border },
  viewerEmpty: { color: C.muted, fontSize: 14, textAlign: 'center', paddingVertical: 28 },
  sortBackdrop: { flex: 1, backgroundColor: 'rgba(35, 27, 25, 0.3)', justifyContent: 'flex-end' },
  sortSheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingHorizontal: 20,
    paddingTop: 9,
    paddingBottom: 26,
  },
  sortSheetWide: { width: 420, alignSelf: 'center', borderRadius: 22, marginBottom: 20 },
  sortSheetTitle: { fontSize: 19, fontWeight: '500', color: C.ink, marginBottom: 6 },

  // Edit search sheet
  editSheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingHorizontal: 20,
    paddingTop: 9,
  },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editSubtitle: { fontSize: 12.5, color: C.muted, marginTop: -2 },
  editRoute: { borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 14 },
  editField: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  editFieldLabel: { fontSize: 11.5, color: C.muted },
  editFieldValue: { fontSize: 16, color: C.ink, fontWeight: '500', marginTop: 1 },
  editDivider: { height: 1, justifyContent: 'center' },
  editDividerLine: { height: 1, backgroundColor: C.border },
  swapButton: {
    position: 'absolute',
    right: 0,
    top: -17,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: { fontSize: 12.5, color: C.muted, marginTop: 16, marginBottom: 8 },
  dateChipRow: { gap: 8, paddingRight: 8 },
  dateChip: {
    minWidth: 78,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dateChipOn: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  dateChipTop: { fontSize: 11.5, color: C.muted },
  dateChipDay: { fontSize: 13.5, color: C.ink, fontWeight: '500' },
  dateChipTextOn: { color: C.white },
  citySearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
  },
  citySearchInput: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1EAE2' },
  cityRowText: { fontSize: 15, color: C.ink },
  cityEmpty: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 28 },
});