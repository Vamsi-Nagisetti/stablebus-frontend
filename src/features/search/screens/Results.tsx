
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { searchApi } from '@/features/search/api';

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

const quickFilters = ['All', 'AC', 'Non-AC', 'Sleeper', 'Seater'] as const;
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
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (period === 'PM') hour += 12;

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
  return String(bus.ac).toLowerCase() === 'true';
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

function getRating(bus: Bus): number {
  return numeric(firstValue(bus, [
    'rating',
    'bus_Rating',
    'operator_Rating',
    'average_Rating',
    'review_Rating',
  ]));
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

export default function Results({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const params = route?.params || {};
  const initialResponse = params.response || {};

  const [buses, setBuses] = useState<Bus[]>(
    Array.isArray(initialResponse.buses) ? initialResponse.buses : []
  );
  const [searchKey, setSearchKey] = useState(initialResponse.search_Key);
  const [journeyDate, setJourneyDate] = useState(params.date || '');

  const from = params.from || 'Departure';
  const to = params.to || 'Destination';
  const fromCityId = params.fromCityId;
  const toCityId = params.toCityId;

  const [quickFilter, setQuickFilter] =
    useState<typeof quickFilters[number]>('All');
  const [sort, setSort] = useState<Sort>('Recommended');
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [operatorSearch, setOperatorSearch] = useState('');

  // Date calendar state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(journeyDate);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = journeyDate
      ? new Date(`${journeyDate}T00:00:00`)
      : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const [searchingDate, setSearchingDate] = useState(false);

  const todayKey = dateKey(new Date());
  const maxDate = new Date(
    new Date().getFullYear() + 1,
    new Date().getMonth(),
    new Date().getDate()
  );
  const maxDateKey = dateKey(maxDate);

  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth]
  );

  const monthTitle = calendarMonth.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const isFirstMonth =
    calendarMonth.getFullYear() === new Date().getFullYear() &&
    calendarMonth.getMonth() === new Date().getMonth();

  const isLastMonth =
    calendarMonth.getFullYear() === maxDate.getFullYear() &&
    calendarMonth.getMonth() === maxDate.getMonth();

  const openDatePicker = () => {
    const current = journeyDate
      ? new Date(`${journeyDate}T00:00:00`)
      : new Date();

    setSelectedDate(journeyDate || todayKey);
    setCalendarMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setShowDatePicker(true);
  };

  const changeMonth = (amount: number) => {
    setCalendarMonth(current =>
      new Date(current.getFullYear(), current.getMonth() + amount, 1)
    );
  };

  const selectDate = (value: string) => {
    if (value < todayKey || value > maxDateKey) return;
    setSelectedDate(value);
  };

  const searchForSelectedDate = async () => {
    if (!fromCityId || !toCityId) {
      const message =
        'City IDs are missing. Please go back to Home and search again.';
      Platform.OS === 'web'
        ? window.alert(message)
        : Alert.alert('Unable to search', message);
      return;
    }

    if (!selectedDate) return;

    setSearchingDate(true);

    try {
      const [year, month, day] = selectedDate.split('-');
      const travel_date = `${month}/${day}/${year}`;

      const response = await searchApi.buses({
        from_city: String(fromCityId),
        to_city: String(toCityId),
        travel_date,
      });

      const updatedBuses = Array.isArray(response?.buses)
        ? response.buses
        : [];

      setBuses(updatedBuses);
      setSearchKey(response?.search_Key);
      setJourneyDate(selectedDate);
      setShowDatePicker(false);

      // Update route params too, so the current search is retained.
      navigation.setParams?.({
        response,
        date: selectedDate,
      });

      // Clear filters that may not exist for the new date.
      setQuickFilter('All');
      setSort('Recommended');
      setAppliedFilters(emptyFilters);
      setDraftFilters(emptyFilters);
      setShowSort(false);
    } catch (error: any) {
      const message = error?.message || 'Please try again.';
      Platform.OS === 'web'
        ? window.alert(`Search failed: ${message}`)
        : Alert.alert('Search failed', message);
    } finally {
      setSearchingDate(false);
    }
  };

  const filterOptions = useMemo(() => {
    const operators = unique(
      buses.map(bus => bus.operator_Name || '').filter(Boolean)
    );
    const amenities = unique(buses.flatMap(bus => getAmenities(bus)));
    return { operators, amenities };
  }, [buses]);

  const filterBusList = (
    source: Bus[],
    selectedQuickFilter: typeof quickFilters[number],
    selectedFilters: FilterState
  ): Bus[] => {
    let result = [...source];

    if (selectedQuickFilter === 'AC') result = result.filter(isAC);
    else if (selectedQuickFilter === 'Non-AC') result = result.filter(bus => !isAC(bus));
    else if (selectedQuickFilter === 'Sleeper') result = result.filter(isSleeper);
    else if (selectedQuickFilter === 'Seater') result = result.filter(isSeater);

    if (selectedFilters.busTypes.length) {
      result = result.filter(bus => {
        const matches: boolean[] = [];
        if (selectedFilters.busTypes.includes('AC')) matches.push(isAC(bus));
        if (selectedFilters.busTypes.includes('Non-AC')) matches.push(!isAC(bus));
        if (selectedFilters.busTypes.includes('Sleeper')) matches.push(isSleeper(bus));
        if (selectedFilters.busTypes.includes('Seater')) matches.push(isSeater(bus));
        return matches.some(Boolean);
      });
    }

    if (selectedFilters.departure.length) {
      result = result.filter(bus =>
        selectedFilters.departure.includes(getTimeBucket(bus.departure_Time))
      );
    }

    if (selectedFilters.arrival.length) {
      result = result.filter(bus =>
        selectedFilters.arrival.includes(getTimeBucket(bus.arrival_Time))
      );
    }

    if (selectedFilters.operators.length) {
      result = result.filter(bus =>
        selectedFilters.operators.includes(bus.operator_Name || '')
      );
    }

    if (selectedFilters.amenities.length) {
      result = result.filter(bus =>
        selectedFilters.amenities.every(item => getAmenities(bus).includes(item))
      );
    }

    return result;
  };

  const filteredBuses = useMemo(() => {
    const result = filterBusList(buses, quickFilter, appliedFilters);

   if (sort === 'Early departure') {
  result.sort(
    (a, b) =>
      (timeToMinutes(a.departure_Time) ?? Infinity) -
      (timeToMinutes(b.departure_Time) ?? Infinity)
  );
} else if (sort === 'Late departure') {
  result.sort(
    (a, b) =>
      (timeToMinutes(b.departure_Time) ?? -Infinity) -
      (timeToMinutes(a.departure_Time) ?? -Infinity)
  );
} else if (sort === 'Price: low to high') {
  result.sort((a, b) => getFare(a) - getFare(b));
} else if (sort === 'Price: high to low') {
  result.sort((a, b) => getFare(b) - getFare(a));
} else if (sort === 'Highest rated') {
  result.sort((a, b) => getRating(b) - getRating(a));
}

    return result;
  }, [buses, quickFilter, appliedFilters, sort]);

  const draftBusCount = useMemo(
    () => filterBusList(buses, quickFilter, draftFilters).length,
    [buses, quickFilter, draftFilters]
  );

  const activeFilterCount =
    appliedFilters.busTypes.length +
    appliedFilters.departure.length +
    appliedFilters.arrival.length +
    appliedFilters.operators.length +
    appliedFilters.amenities.length;

  const openFilters = () => {
    setDraftFilters({
      busTypes: [...appliedFilters.busTypes],
      departure: [...appliedFilters.departure],
      arrival: [...appliedFilters.arrival],
      operators: [...appliedFilters.operators],
      amenities: [...appliedFilters.amenities],
    });
    setOperatorSearch('');
    setShowFilters(true);
  };

  const updateDraft = (key: keyof FilterState, value: string) => {
    setDraftFilters(current => ({
      ...current,
      [key]: toggleValue(current[key], value),
    }));
  };

  const clearFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setQuickFilter('All');
  };

  const openBus = (bus: Bus) => {
    navigation.navigate('seats', {
      bus,
      searchKey,
      busKey: bus.bus_Key,
      from,
      to,
      date: journeyDate,
      boardingDetails: bus.boardingDetails || [],
      droppingDetails: bus.droppingDetails || [],
      dropPointMandatory: bus.dropPoint_Mandatory,
    });
  };

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Pressable key={label} onPress={onPress} style={s.optionRow}>
      <View style={[s.checkbox, selected && s.checkboxSelected]}>
        {selected && <Ionicons name="checkmark" size={13} color={C.white} />}
      </View>
      <Text style={s.optionText} numberOfLines={2}>{label}</Text>
    </Pressable>
  );

  const renderFilterSection = (
    title: string,
    values: string[],
    selected: string[],
    key: keyof FilterState
  ) => (
    <View style={s.filterSection}>
      <Text style={s.filterSectionTitle}>{title}</Text>
      {values.length ? (
        <View style={s.filterOptions}>
          {values.map(value =>
            renderOption(value, selected.includes(value), () => updateDraft(key, value))
          )}
        </View>
      ) : (
        <Text style={s.unavailableText}>
          No {title.toLowerCase()} information provided by the operator.
        </Text>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* ROUTE HEADER */}
      <View style={s.header}>
        <View style={[s.headerInner, !isMobile && s.wide]}>
          <Pressable style={s.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={19} color={C.ink} />
          </Pressable>

          <View style={s.headerRoute}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {from} <Text style={s.routeArrow}>→</Text> {to}
            </Text>
            <Text style={s.headerDate}>{formatJourneyDate(journeyDate)}</Text>
          </View>

          <Pressable style={s.editButton} onPress={() => navigation.goBack()}>
            <Ionicons name="create-outline" size={17} color={C.burgundy} />
            <Text style={s.editText}>Edit</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        <View style={[s.content, !isMobile && s.wide]}>
          {/* SUMMARY */}
          <View style={s.summary}>
            <View>
              <Text style={s.pageTitle}>Available buses</Text>
              <Text style={s.resultCount}>
                {filteredBuses.length} of {buses.length} buses
              </Text>
            </View>

            <Pressable style={s.dateBadge} onPress={openDatePicker}>
              <Ionicons name="calendar-outline" size={14} color={C.burgundy} />
              <Text style={s.dateBadgeText}>
                {formatJourneyDate(journeyDate)}
              </Text>
              <Ionicons name="chevron-down" size={12} color={C.burgundy} />
            </Pressable>
          </View>

          {/* FILTERS AND SORT */}
          <View style={s.controls}>
            <Pressable
              style={[s.filterButton, activeFilterCount > 0 && s.filterButtonActive]}
              onPress={openFilters}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={activeFilterCount > 0 ? C.white : C.burgundy}
              />
              <Text style={[
                s.filterButtonText,
                activeFilterCount > 0 && s.filterButtonTextActive,
              ]}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </Pressable>

            <View style={s.sortContainer}>
              <Pressable
                style={s.sortButton}
                onPress={() => setShowSort(value => !value)}
              >
                <Ionicons name="swap-vertical-outline" size={16} color={C.burgundy} />
                <Text style={s.sortButtonText}>Sort</Text>
                <Ionicons name="chevron-down" size={13} color={C.muted} />
              </Pressable>

              {showSort && (
                <>
                  <Pressable
                    style={s.dismissSort}
                    onPress={() => setShowSort(false)}
                  />
                  <View style={s.sortMenu}>
                    {sortOptions.map(item => (
                      <Pressable
                        key={item}
                        style={s.sortOption}
                        onPress={() => {
                          setSort(item);
                          setShowSort(false);
                        }}
                      >
                        <Text style={[
                          s.sortOptionText,
                          sort === item && s.sortOptionSelected,
                        ]}>
                          {item}
                        </Text>
                        {sort === item && (
                          <Ionicons name="checkmark" size={16} color={C.burgundy} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.quickFilterScroll}
              contentContainerStyle={s.filterRow}
            >
              {quickFilters.map(item => {
                const active = quickFilter === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setQuickFilter(item === quickFilter ? 'All' : item)}
                    style={[s.filterChip, active && s.filterChipActive]}
                  >
                    <Text style={[s.filterText, active && s.filterTextActive]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {sort !== 'Recommended' && (
            <View style={s.sortLabel}>
              <Text style={s.sortLabelText}>Sorted by {sort.toLowerCase()}</Text>
              <Pressable onPress={() => setSort('Recommended')}>
                <Text style={s.clearSort}>Reset</Text>
              </Pressable>
            </View>
          )}

          {/* BUS RESULTS */}
          {buses.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <Ionicons name="bus-outline" size={31} color={C.burgundy} />
              </View>
              <Text style={s.emptyTitle}>No buses found</Text>
              <Text style={s.emptySubtitle}>
                There are no buses available for this route and date.
                Try changing your journey date.
              </Text>
              <Pressable style={s.backHomeButton} onPress={openDatePicker}>
                <Text style={s.backHomeText}>Change travel date</Text>
              </Pressable>
            </View>
          ) : filteredBuses.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyTitle}>No matching buses</Text>
              <Text style={s.emptySubtitle}>
                Try changing or clearing your filters.
              </Text>
              <Pressable
                style={s.backHomeButton}
                onPress={() => {
                  clearFilters();
                  setSort('Recommended');
                }}
              >
                <Text style={s.backHomeText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.busList}>
              {filteredBuses.map((bus, index) => {
                const fare = getFare(bus);
                const duration = getDuration(bus.departure_Time, bus.arrival_Time);
                const ac = isAC(bus);
                const sleeper = isSleeper(bus);
                const seater = isSeater(bus);
                const rating = getRating(bus);

                return (
                  <Pressable
                    key={`${bus.bus_Key || 'bus'}-${index}`}
                    style={s.busCard}
                    onPress={() => openBus(bus)}
                    android_ripple={{ color: C.burgundyLight }}
                  >
                    <View style={s.busTop}>
                      <View style={s.operatorInfo}>
                        <View style={s.busIcon}>
                          <Ionicons name="bus-outline" size={20} color={C.burgundy} />
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
                        <Text style={s.fareValue}>{formatPrice(fare)}</Text>
                        {rating > 0 && (
                          <View style={s.ratingRow}>
                            <Ionicons name="star" size={12} color="#C18A43" />
                            <Text style={s.ratingText}>{rating.toFixed(1)}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={s.tags}>
                      <View style={s.typeTag}>
                        <Ionicons
                          name={ac ? 'snow-outline' : 'sunny-outline'}
                          size={12}
                          color={C.muted}
                        />
                        <Text style={s.typeTagText}>{ac ? 'AC' : 'NON-AC'}</Text>
                      </View>

                      {sleeper && (
                        <View style={s.typeTag}>
                          <Ionicons name="bed-outline" size={12} color={C.muted} />
                          <Text style={s.typeTagText}>SLEEPER</Text>
                        </View>
                      )}

                      {seater && (
                        <View style={s.typeTag}>
                          <Ionicons name="briefcase-outline" size={12} color={C.muted} />
                          <Text style={s.typeTagText}>SEATER</Text>
                        </View>
                      )}
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
                        <Text style={s.durationText}>{duration || '—'}</Text>
                        <Text style={s.durationCaption}>Journey duration</Text>
                      </View>
                    </View>

                    <View style={s.availabilityRow}>
                      <Ionicons name="ticket-outline" size={12} color={C.muted} />
                      <Text style={s.seatCount}>
                        {bus.available_Seats ?? '—'} seats available
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={s.bottomNote}>
            <Ionicons name="information-circle-outline" size={15} color={C.muted} />
            <Text style={s.bottomNoteText}>
              Fares and seat availability are provided by the bus operator.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* DATE PICKER */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={s.dateBackdrop}>
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

      {/* FILTER MODAL */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={s.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowFilters(false)}
          />

          <View style={[s.filterSheet, !isMobile && s.filterSheetWide]}>
            <View style={s.sheetHandle} />

            <View style={s.sheetHeader}>
              <View>
                <Text style={s.sheetTitle}>Filters</Text>
                <Text style={s.sheetSubtitle}>
                  Refine your bus search · {draftBusCount} buses match
                </Text>
              </View>

              <Pressable
                style={s.closeButton}
                onPress={() => setShowFilters(false)}
              >
                <Ionicons name="close" size={20} color={C.ink} />
              </Pressable>
            </View>

            <ScrollView
              style={s.filterScroll}
              contentContainerStyle={s.filterScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderFilterSection(
                'Bus type',
                ['AC', 'Non-AC', 'Sleeper', 'Seater'],
                draftFilters.busTypes,
                'busTypes'
              )}

              {renderFilterSection(
                'Departure time',
                ['Morning', 'Afternoon', 'Evening', 'Night'],
                draftFilters.departure,
                'departure'
              )}

              {renderFilterSection(
                'Arrival time',
                ['Morning', 'Afternoon', 'Evening', 'Night'],
                draftFilters.arrival,
                'arrival'
              )}

              <View style={s.filterSection}>
                <Text style={s.filterSectionTitle}>Operator</Text>
                <View style={s.operatorSearch}>
                  <Ionicons name="search-outline" size={16} color={C.muted} />
                  <TextInput
                    value={operatorSearch}
                    onChangeText={setOperatorSearch}
                    placeholder="Search bus operator"
                    placeholderTextColor={C.muted}
                    style={s.operatorSearchInput}
                  />
                </View>

                {renderFilterSection(
                  'Available operators',
                  filterOptions.operators.filter(name =>
                    name.toLowerCase().includes(operatorSearch.toLowerCase())
                  ),
                  draftFilters.operators,
                  'operators'
                )}
              </View>

              {renderFilterSection(
                'Amenities',
                filterOptions.amenities,
                draftFilters.amenities,
                'amenities'
              )}
            </ScrollView>

            <View style={s.filterFooter}>
              <Pressable
                style={s.clearButton}
                onPress={() => setDraftFilters(emptyFilters)}
              >
                <Text style={s.clearButtonText}>Clear all</Text>
              </Pressable>

              <Pressable
                style={s.applyButton}
                onPress={() => {
                  setAppliedFilters(draftFilters);
                  setShowFilters(false);
                }}
              >
                <Text style={s.applyButtonText}>
                  Show buses ({draftBusCount})
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: C.paper,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerInner: {
    height: 65,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRoute: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  routeArrow: { color: C.burgundy },
  headerDate: { fontSize: 10, color: C.muted, marginTop: 3 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
  },
  editText: { fontSize: 11, color: C.burgundy, fontWeight: '600' },

  scroll: { paddingHorizontal: 13, paddingTop: 15, paddingBottom: 35 },
  content: { width: '100%' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pageTitle: { fontSize: 19, fontWeight: '700', color: C.ink },
  resultCount: { fontSize: 10, color: C.muted, marginTop: 4 },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
  },
  dateBadgeText: { fontSize: 9, color: C.burgundy, fontWeight: '600' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 13,
    zIndex: 20,
  },
  quickFilterScroll: { flex: 1, minWidth: 0 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 2,
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  filterChipActive: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  filterText: { fontSize: 10, color: C.muted, fontWeight: '600' },
  filterTextActive: { color: C.white, fontWeight: '700' },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  filterButtonActive: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  filterButtonText: { fontSize: 10, color: C.ink, fontWeight: '600' },
  filterButtonTextActive: { color: C.white },

  sortContainer: { position: 'relative', zIndex: 30 },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  sortButtonText: { fontSize: 10, color: C.ink, fontWeight: '600' },
  dismissSort: {
    ...StyleSheet.absoluteFillObject,
    position: 'absolute',
    width: 2000,
    height: 2000,
    left: -1000,
    top: -1000,
    zIndex: 1,
  },
  sortMenu: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 190,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 11,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    zIndex: 50,
  },
  sortOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sortOptionText: { fontSize: 11, color: C.muted },
  sortOptionSelected: { color: C.burgundy, fontWeight: '700' },
  sortLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sortLabelText: { fontSize: 10, color: C.muted },
  clearSort: { fontSize: 10, color: C.burgundy, fontWeight: '600' },

  busList: { gap: 9 },
  busCard: {
    backgroundColor: C.paper,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    overflow: 'hidden',
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
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorText: { flex: 1, minWidth: 0 },
  operatorName: { fontSize: 12, fontWeight: '700', color: C.ink },
  busType: { fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 13 },
  fareBlock: { alignItems: 'flex-end', minWidth: 85 },
  fareCaption: { fontSize: 8, color: C.muted },
  fareValue: {
    fontSize: 17,
    fontWeight: '700',
    color: C.burgundy,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  ratingText: { fontSize: 9, color: C.muted, fontWeight: '600' },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3EFE9',
  },
  typeTagText: {
    fontSize: 8,
    color: C.muted,
    fontWeight: '700',
    letterSpacing: 0.2,
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
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: -0.3,
  },
  timeCaption: { fontSize: 9, color: C.muted, marginTop: 2, maxWidth: 115 },
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
  durationText: { fontSize: 12, color: C.ink, fontWeight: '700' },
  durationCaption: {
    fontSize: 8,
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
  seatCount: { fontSize: 9, color: C.muted, fontWeight: '500' },

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
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  emptySubtitle: {
    fontSize: 11,
    lineHeight: 17,
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
    paddingVertical: 11,
  },
  backHomeText: { color: C.white, fontSize: 11, fontWeight: '600' },
  bottomNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  bottomNoteText: { fontSize: 9, color: C.muted },

  // Date calendar
  dateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(35, 27, 25, 0.48)',
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
  calendarTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  calendarSubtitle: { fontSize: 10, color: C.muted, marginTop: 4 },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 12,
  },
  monthArrow: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledArrow: { opacity: 0.3 },
  monthTitle: { fontSize: 13, fontWeight: '700', color: C.burgundy },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: '14.2857%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: { fontSize: 10, color: C.muted, fontWeight: '700' },
  calendarDay: { borderRadius: 12 },
  calendarDaySelected: { backgroundColor: C.burgundy },
  calendarDayDisabled: { opacity: 0.3 },
  calendarDayText: { fontSize: 12, color: C.ink, fontWeight: '600' },
  calendarDayTextSelected: { color: C.white, fontWeight: '700' },
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
  selectedDateText: { fontSize: 11, color: C.burgundy, fontWeight: '600' },
  searchDateButton: {
    height: 46,
    borderRadius: 11,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 13,
  },
  searchDateButtonDisabled: { opacity: 0.65 },
  searchDateButtonText: { color: C.white, fontSize: 12, fontWeight: '700' },

  // Filter modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(35, 27, 25, 0.42)',
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
  sheetTitle: { fontSize: 19, fontWeight: '700', color: C.ink },
  sheetSubtitle: { fontSize: 10, color: C.muted, marginTop: 3 },
  closeButton: {
    width: 34,
    height: 34,
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
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 11,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 15,
    rowGap: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '47%',
    minHeight: 27,
    gap: 8,
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CFC3B9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  optionText: { flex: 1, fontSize: 10, color: C.ink },
  unavailableText: { fontSize: 10, color: C.muted, lineHeight: 16 },
  operatorSearch: {
    height: 40,
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
  operatorSearchInput: { flex: 1, fontSize: 11, color: C.ink, paddingVertical: 0 },
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
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.paper,
  },
  clearButtonText: { fontSize: 12, fontWeight: '600', color: C.burgundy },
  applyButton: {
    flex: 1.5,
    height: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.burgundy,
  },
  applyButtonText: { fontSize: 12, fontWeight: '700', color: C.white },
});
