
import React, { useEffect, useMemo, useState } from 'react';
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
import type { City } from '@/types/api';

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

export default function Home({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [cities, setCities] = useState<City[]>([]);
  const [from, setFrom] = useState<City | null>(null);
  const [to, setTo] = useState<City | null>(null);
  const [journeyDate, setJourneyDate] = useState(dateKey(new Date()));

  const [picker, setPicker] = useState<CityField | null>(null);
  const [query, setQuery] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);

  const [loadingCities, setLoadingCities] = useState(true);
  const [searching, setSearching] = useState(false);
  const [cityError, setCityError] = useState('');

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

        const response = await searchApi.cities();
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

  const filteredCities = useMemo(() => {
    const value = query.trim().toLowerCase();

    return cities
      .filter((city) =>
        city.cityName.toLowerCase().includes(value)
      )
      .slice(0, 100);
  }, [cities, query]);

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
    setQuery('');
    setPicker(field);
  };

  const selectCity = (city: City) => {
    if (picker === 'from') {
      setFrom(city);
      if (to && String(to.cityID) === String(city.cityID)) setTo(null);
    } else {
      setTo(city);
      if (from && String(from.cityID) === String(city.cityID)) setFrom(null);
    }

    setPicker(null);
    setQuery('');
  };

  const swapCities = () => {
    setFrom(to);
    setTo(from);
  };

  const choosePopular = (city: City) => {
    if (!from) {
      setFrom(city);
    } else if (String(from.cityID) !== String(city.cityID)) {
      setTo(city);
    }
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

  const searchBuses = async () => {
  if (!from || !to) {
    const message = 'Please select both departure and destination cities.';
    Platform.OS === 'web'
      ? window.alert(message)
      : Alert.alert('Choose your route', message);
    return;
  }

  if (String(from.cityID) === String(to.cityID)) {
    const message = 'Departure and destination must be different.';
    Platform.OS === 'web'
      ? window.alert(message)
      : Alert.alert('Invalid route', message);
    return;
  }

  setSearching(true);

  try {
    // Convert YYYY-MM-DD to MM/DD/YYYY
    const [year, month, day] = journeyDate.split('-');
    const travel_date = `${month}/${day}/${year}`;

    const response = await searchApi.buses({
      from_city: String(from.cityID),
      to_city: String(to.cityID),
      travel_date,
    });

    navigation.navigate('results', {
  response,
  from: from.cityName,
  to: to.cityName,
  date: journeyDate,
  fromCityId: String(from.cityID),
  toCityId: String(to.cityID),
});
  } catch (error: any) {
    const message = error?.message || 'Please try again.';
    Platform.OS === 'web'
      ? window.alert(`Search failed: ${message}`)
      : Alert.alert('Search failed', message);
  } finally {
    setSearching(false);
  }
};

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* HEADER */}
        <View style={s.header}>
          <View style={[s.headerInner, !isMobile && s.wide]}>
            <View style={s.brandRow}>
              <View style={s.brandMark}>
                <Ionicons name="bus-outline" size={19} color={C.white} />
              </View>
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
              <Pressable style={s.profile}>
                <Ionicons name="person-outline" size={17} color={C.burgundy} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* QUIET HERO */}
        <View style={[s.hero, isMobile && s.heroMobile]}>
          <View style={[s.heroInner, !isMobile && s.wide]}>
            <View style={s.heroCopy}>
              <Text style={s.heroEyebrow}>TRAVEL, MADE SIMPLE</Text>
              <Text style={[s.heroTitle, isMobile && s.heroTitleMobile]}>
                Your journey starts here.
              </Text>
              <Text style={s.heroSubtitle}>
                Find your bus. Pick your seat. Enjoy the journey.
              </Text>
            </View>

            <View style={[s.heroArtwork, isMobile && s.heroArtworkMobile]}>
              <Ionicons
                name="bus-outline"
                size={isMobile ? 54 : 76}
                color="#F4E9E5"
              />
            </View>
          </View>
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
                <Text style={s.dateHint}>Choose your travel day</Text>
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
              {quickDates.map((value, index) => {
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
                      {index === 0 ? 'TODAY' : date.month.toUpperCase()}
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
              {searching ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Ionicons name="search-outline" size={18} color={C.white} />
                  <Text style={s.searchText}>Search buses</Text>
                  <Ionicons name="arrow-forward" size={17} color={C.white} />
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* POPULAR DESTINATIONS */}
        <View style={[s.popularSection, !isMobile && s.wide]}>
          <View style={s.sectionHeading}>
            <View>
              <Text style={s.sectionTitle}>Popular destinations</Text>
              <Text style={s.sectionSubtitle}>Explore routes people love</Text>
            </View>
            <View style={s.popularTag}>
              <Ionicons name="trending-up-outline" size={13} color={C.burgundy} />
              <Text style={s.popularTagText}>Popular</Text>
            </View>
          </View>

          {loadingCities ? (
            <ActivityIndicator color={C.burgundy} style={{ marginTop: 22 }} />
          ) : cityError ? (
            <View style={s.errorCard}>
              <Ionicons name="alert-circle-outline" size={19} color={C.burgundy} />
              <Text style={s.errorText}>{cityError}</Text>
            </View>
          ) : (
            <View style={s.cityGrid}>
              {popularCities.map((city) => (
                <Pressable
                  key={`${city.cityID}-${city.cityName}`}
                  style={[s.popularCard, isMobile && s.popularCardMobile]}
                  onPress={() => choosePopular(city)}
                >
                  <View style={s.popularIcon}>
                    <Ionicons
                      name={cityIcon(city.cityName)}
                      size={19}
                      color={C.burgundy}
                    />
                  </View>
                  <View style={s.popularText}>
                    <Text style={s.popularName}>{city.cityName}</Text>
                    <Text style={s.popularCaption}>Explore buses</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </Pressable>
              ))}
            </View>
          )}

          {!loadingCities && !cityError && popularCities.length === 0 && (
            <Text style={s.emptyPopular}>Popular destinations will appear here.</Text>
          )}
        </View>

        <View style={s.footer}>
          <Ionicons name="shield-checkmark-outline" size={15} color={C.muted} />
          <Text style={s.footerText}>Simple booking. Comfortable journeys.</Text>
        </View>
      </ScrollView>

      {/* CITY PICKER */}
      <Modal
        visible={!!picker}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>
                  Choose {picker === 'from' ? 'departure' : 'destination'}
                </Text>
                <Text style={s.modalSubtitle}>Search and select a city</Text>
              </View>
              <Pressable style={s.closeButton} onPress={() => setPicker(null)}>
                <Ionicons name="close" size={19} color={C.ink} />
              </Pressable>
            </View>

            <View style={s.searchInputWrap}>
              <Ionicons name="search-outline" size={18} color={C.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search city"
                placeholderTextColor="#A99B94"
                autoFocus
                style={s.searchInput}
              />
            </View>

            {loadingCities ? (
              <ActivityIndicator color={C.burgundy} style={{ padding: 25 }} />
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={s.cityList}
              >
                {filteredCities.map((city) => (
                  <Pressable
                    key={`${city.cityID}-${city.cityName}`}
                    style={s.cityOption}
                    onPress={() => selectCity(city)}
                  >
                    <View style={s.optionIcon}>
                      <Ionicons name="location-outline" size={17} color={C.burgundy} />
                    </View>
                    <Text style={s.optionName}>{city.cityName}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </Pressable>
                ))}
                {filteredCities.length === 0 && (
                  <Text style={s.emptyText}>No cities found.</Text>
                )}
              </ScrollView>
            )}
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 30 },

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
    fontWeight: '650',
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
    marginTop: -27,
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
    fontWeight: '650',
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
  dateMonth: {
    fontSize: 8,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.3,
  },
  dateNumber: {
    fontSize: 19,
    fontWeight: '650',
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
    fontWeight: '650',
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

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 25,
  },
  footerText: { color: C.muted, fontSize: 10 },

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
  modalTitle: { fontSize: 16, fontWeight: '650', color: C.ink },
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
  monthTitle: { fontSize: 14, fontWeight: '650', color: C.ink },
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
});
