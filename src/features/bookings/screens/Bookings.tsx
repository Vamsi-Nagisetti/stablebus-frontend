import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchApi } from '@/features/search/api';
import {
  Booking,
  BookingPassenger,
  CancellationQuote,
  bookingsApi,
} from '@/features/bookings/api';
import RateTripSheet, { RateRow, RateTarget } from '@/features/reviews/RateTripSheet';
import { reviewsApi } from '@/features/reviews/api';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
  danger: '#A34444',
  dangerLight: '#F7ECEA',
  green: '#47765B',
  greenLight: '#EAF1EB',
};

const PAGE_RGB = '248,244,237';

const money = (value: string, currency = 'INR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const dateLabel = (value?: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const statusLabel = (status: string) =>
  String(status || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

/** Soft colours for the status pill: green when confirmed, rose when cancelled, burgundy otherwise. */
const statusTone = (status: string) => {
  const value = String(status || '').toUpperCase();
  if (value === 'CONFIRMED') return { bg: C.greenLight, fg: C.green };
  if (value === 'CANCELLED' || value === 'FAILED') return { bg: C.dangerLight, fg: C.danger };
  return { bg: C.burgundyLight, fg: C.burgundy };
};

type CoinBannerInfo = {
  key: string;
  kind: 'reward' | 'used';
  title: string;
  caption: string;
};

const coinText = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'coin' : 'coins'}`;

/** Quiet coin notes for one ticket. Rewards carry the coin picture; coins spent carry a wallet icon. */
const coinBanners = (booking: Booking): CoinBannerInfo[] => {
  const w = (booking as any).wallet as
    | {
        coins_used?: number;
        coins_state?: 'PENDING' | 'USED' | 'RETURNED';
        coins_returned?: number;
        coins_earned?: number;
        coins_expected?: number;
      }
    | null
    | undefined;
  if (!w) return [];
  const out: CoinBannerInfo[] = [];

  if (w.coins_earned) {
    out.push({
      key: 'earned',
      kind: 'reward',
      title: `${coinText(w.coins_earned)} earned`,
      caption: 'in your wallet',
    });
  } else if (w.coins_expected) {
    out.push({
      key: 'expected',
      kind: 'reward',
      title: `${coinText(w.coins_expected)} to earn`,
      caption: 'after you complete this trip',
    });
  }

  if (w.coins_used) {
    if (w.coins_state === 'RETURNED') {
      out.push({
        key: 'returned',
        kind: 'used',
        title: `${coinText(w.coins_used)} returned`,
        caption: 'back in your wallet',
      });
    } else {
      out.push({
        key: 'used',
        kind: 'used',
        title: `${coinText(w.coins_used)} used`,
        caption:
          w.coins_state === 'PENDING'
            ? 'returned if you cancel'
            : 'applied to this ticket',
      });
    }
  }
  return out;
};

const CoinBanners = ({ booking }: { booking: Booking }) => {
  const items = coinBanners(booking);
  if (!items.length) return null;
  return (
    <View style={styles.coinBannerStack}>
      {items.map(item => (
        <View key={item.key} style={styles.coinBanner}>
          {item.kind === 'reward' ? (
            <Image source={require('@/assets/scenic/coin_flat.png')} style={styles.coinBannerCoin} resizeMode="contain" />
          ) : (
            <View style={styles.coinBannerWallet}>
              <Ionicons name="wallet-outline" size={14} color={C.muted} />
            </View>
          )}
          <Text style={styles.coinBannerTitle} numberOfLines={2}>
            {item.title}
            <Text style={styles.coinBannerCaption}>{`  ·  ${item.caption}`}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
};

const isCancelled = (booking: Booking) =>
  ['CANCELLED', 'FAILED'].includes(String(booking.booking_status).toUpperCase());

/** Not confirmed: payment pending, ticketing unknown, ... (anything that is not confirmed or cancelled). */
const isPending = (booking: Booking) =>
  String(booking.booking_status).toUpperCase() !== 'CONFIRMED' && !isCancelled(booking);

const getDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const firstPointValue = (value: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return null;
};

const getPointDetails = (
  point: unknown,
  kind: 'boarding' | 'dropping'
): { name: string; time: string | null; address: string | null } => {
  if (!point) return { name: 'Not available', time: null, address: null };

  if (typeof point === 'string') {
    const trimmed = point.trim();
    return { name: trimmed || 'Not available', time: null, address: null };
  }

  if (typeof point !== 'object' || Array.isArray(point)) {
    return { name: 'Not available', time: null, address: null };
  }

  const value = point as Record<string, unknown>;
  const prefix = kind === 'boarding' ? 'boarding' : 'dropping';
  const name = firstPointValue(value, [
    `${prefix}_Name`, `${prefix}_name`,
    'name', 'point_name', 'pointName', 'location_name', 'locationName',
    `${prefix}_Contact`,
  ]);
  const time = firstPointValue(value, [
    `${prefix}_Time`, `${prefix}_time`, 'time', 'pickup_time', 'drop_time',
  ]);
  const rawAddress = firstPointValue(value, [
    `${prefix}_Address`, `${prefix}_address`, 'address', 'location',
    `${prefix}_Landmark`, `${prefix}_landmark`,
  ]);

  // The boarding address can be a caret-delimited composite string: name^time^id^address^...
  // Prefer the explicit name/time fields above.
  const addressParts = rawAddress?.split('^').map(part => part.trim()).filter(Boolean) || [];
  const address = addressParts.length > 1
    ? addressParts.slice(3).join(', ') || addressParts[0]
    : rawAddress;

  return {
    name: name || addressParts[0] || 'Not available',
    time: time || (addressParts.length > 1 ? addressParts[1] : null),
    address: address && address !== name ? address : null,
  };
};

const formatPoint = (point: unknown, kind: 'boarding' | 'dropping'): string =>
  getPointDetails(point, kind).name;

/** "cancellationCharge_Key" -> "Cancellation charge key" */
const humanKey = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());

const getQuoteSummary = (quote: CancellationQuote) => {
  const preferred = [
    'cancellationCharge_Key',
    'cancellable',
    'message',
    'cancellationCharges',
    'cancellation_Charges',
    'refundAmount',
    'refund_Amount',
    'cancellationCharge',
    'cancellation_Charge',
  ];

  const entries = preferred
    .filter(key => quote[key] !== undefined)
    .map(key => [key, quote[key]] as const);

  return entries.length ? entries : Object.entries(quote);
};

/** Soft fade from the page colour at one edge, built from one SVG gradient. */
function EdgeFade({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const id = `bk-fade-${edge}`;
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

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.status, { color: tone.fg }]}>{statusLabel(status)}</Text>
    </View>
  );
}

export default function BookingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<Booking[]>([]);
  const [cities, setCities] = useState<Array<{ cityID: string | number; cityName: string }>>([]);

  const [loading, setLoading] = useState(true);
  // The page is shown only when bookings AND city names are both ready.
  const [citiesReady, setCitiesReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'completed' | 'other'>('upcoming');

  const [details, setDetails] = useState<Booking | null>(null);

  // Ratings for completed trips
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [rewardCoins, setRewardCoins] = useState(0);
  const [ratingsOn, setRatingsOn] = useState(false);
  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareError, setShareError] = useState('');

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

  const todayKey = getDateKey();

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError('');

      const response = await bookingsApi.history(50, 0);
      setItems(Array.isArray(response?.items) ? response.items : []);
    } catch (e: any) {
      setError(e?.message || 'Unable to load your bookings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;

    searchApi.cities()
      .then(response => {
        if (active) setCities(response.cityDetails || []);
      })
      .catch(err => {
        console.warn('[StableBus Bookings] City lookup failed:', err);
      })
      .finally(() => {
        if (active) setCitiesReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const cityName = (id: string | number, saved?: string) => {
    const city = cities.find(item => String(item.cityID) === String(id));
    return city?.cityName || saved || 'City unavailable';
  };

  const formatClock = (value?: string) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/am|pm/i.test(v)) return v.toUpperCase();
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (!m) return v;
    const h = Number(m[1]);
    return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  // Confirmed journeys from today on.
  const upcoming = useMemo(
    () =>
      items.filter(booking => {
        const journey = booking.journey_date?.slice(0, 10);
        return !isCancelled(booking) && !isPending(booking) && !!journey && journey >= todayKey;
      }),
    [items, todayKey]
  );

  // Confirmed journeys that are done.
  const completed = useMemo(
    () =>
      items.filter(booking => {
        const journey = booking.journey_date?.slice(0, 10);
        return !isCancelled(booking) && !isPending(booking) && !!journey && journey < todayKey;
      }),
    [items, todayKey]
  );

  // Which completed trips are already rated, and what a rating is worth.
  const completedIds = completed.map(b => b.booking_id).join(',');
  useEffect(() => {
    if (!completedIds) return;
    let alive = true;
    reviewsApi
      .status(completedIds.split(','))
      .then(res => {
        if (!alive) return;
        setRatingsOn(!!res.enabled);
        setRewardCoins(res.reward_coins || 0);
        setRatings(Object.fromEntries(Object.entries(res.reviews || {}).map(([id, r]) => [id, r.rating])));
      })
      .catch(() => {
        // Ratings are optional: hide the row if the server cannot be reached.
      });
    return () => {
      alive = false;
    };
  }, [completedIds]);

  const isCompletedTrip = (booking: Booking) => {
    const journey = booking.journey_date?.slice(0, 10);
    return !isCancelled(booking) && !isPending(booking) && !!journey && journey < todayKey;
  };

  const openRate = (booking: Booking) => {
    // Two sheets cannot be open together: the details sheet would hide the rating sheet.
    setDetails(null);
    const bus = ((booking.boarding_point as any)?._bus || {}) as Record<string, string>;
    setRateTarget({
      bookingId: booking.booking_id,
      operator: booking.operator_name || bus.operator_name || '',
      route: `${cityName(booking.source_city_id, bus.source_city_name)} → ${cityName(booking.destination_city_id, bus.destination_city_name)}`,
      date: dateLabel(booking.journey_date),
    });
  };

  const rateRow = (booking: Booking) =>
    ratingsOn && isCompletedTrip(booking) ? (
      <RateRow
        rating={ratings[booking.booking_id]}
        rewardCoins={rewardCoins}
        onPress={() => openRate(booking)}
      />
    ) : null;

  // Cancelled, failed and payment-pending bookings live together in their own tab.
  const other = useMemo(
    () => items.filter(booking => isCancelled(booking) || isPending(booking)),
    [items]
  );

  const visible = tab === 'upcoming' ? upcoming : tab === 'completed' ? completed : other;

  // Cancellation is only available for confirmed future journeys.
  // Completed bookings never render the cancellation button.
  const canCancel = (booking: Booking) => {
    const journey = booking.journey_date?.slice(0, 10);

    return (
      !!journey &&
      journey >= getDateKey() &&
      String(booking.booking_status).toUpperCase() === 'CONFIRMED' &&
      (booking.seat_numbers || []).some(
        seat => !(booking.cancelled_seat_numbers || []).includes(String(seat))
      )
    );
  };

  const shareTicket = async (booking: Booking) => {
    const passengers = (booking.passengers || [])
      .map(
        p =>
          `${p.name} — Seat ${p.seat_number}${p.ticket_number ? ` — Ticket ${p.ticket_number}` : ''}`
      )
      .join('\n');

    const message = [
      'StableBus booking details',
      `Booking reference: ${booking.booking_id}`,
      `PNR: ${booking.transport_pnr || 'Not available'}`,
      `Journey date: ${dateLabel(booking.journey_date)}`,
      `From: ${cityName(booking.source_city_id)}`,
      `To: ${cityName(booking.destination_city_id)}`,
      ...(booking.operator_name ? [`Bus operator: ${booking.operator_name}`] : []),
      `Boarding: ${formatPoint(booking.boarding_point, 'boarding')}`,
      `Dropping: ${formatPoint(booking.dropping_point, 'dropping')}`,
      `Passengers:\n${passengers || 'Not available'}`,
      `Amount: ${money(booking.total_amount, booking.currency)}`,
    ].join('\n\n');

    try {
      setShareError('');
      await Share.share({ message });
    } catch {
      setShareError("We couldn't open sharing. Please try again.");
    }
  };

  const openDetails = (booking: Booking) => {
    setShareError('');
    setDetails(booking);
  };

  const openCancellation = (booking: Booking) => {
    if (!canCancel(booking)) return;

    setDetails(null);
    setCancelBooking(booking);
    setSelectedSeats([]);
    setQuote(null);
    setConfirming(false);
    setError('');
  };

  const closeCancellation = () => {
    if (busy) return;
    setCancelBooking(null);
    setQuote(null);
    setConfirming(false);
    setSelectedSeats([]);
    setError('');
  };

  const toggleSeat = (seat: string) => {
    if (quote) return;

    setSelectedSeats(current =>
      current.includes(seat) ? current.filter(value => value !== seat) : [...current, seat]
    );
  };

  const requestQuote = async () => {
    if (!cancelBooking || !selectedSeats.length) return;

    try {
      setBusy(true);
      setError('');

      const result = await bookingsApi.cancellationCharges(cancelBooking.booking_id, selectedSeats);

      if (
        String(result?.cancellable).toLowerCase() !== 'true' ||
        !result?.cancellationCharge_Key
      ) {
        throw new Error(
          (typeof result?.message === 'string' && result.message) ||
            'The provider has not confirmed that these seats can be cancelled.'
        );
      }

      setQuote(result);
    } catch (e: any) {
      setError(e?.message || 'Unable to retrieve cancellation charges.');
    } finally {
      setBusy(false);
    }
  };

  const submitCancellation = async () => {
    if (!cancelBooking || !quote?.cancellationCharge_Key) return;

    try {
      setBusy(true);
      setError('');

      const result: any = await bookingsApi.cancel(
        cancelBooking.booking_id,
        selectedSeats,
        quote.cancellationCharge_Key as string
      );
      const refund = result?.refund;

      setCancelBooking(null);
      setQuote(null);
      setConfirming(false);
      setSelectedSeats([]);

      await load(true);
      const rupees = Number(refund?.refund_cash || 0);
      const coins = Number(refund?.refund_coins || 0);
      const parts: string[] = [];
      if (rupees > 0) parts.push(`₹${rupees.toLocaleString('en-IN')} to your original payment method`);
      if (coins > 0) parts.push(`${coins} coins back to your wallet`);
      showToast(
        parts.length
          ? `Cancelled. Refund: ${parts.join(' and ')}.`
          : refund?.status === 'FAILED_NEEDS_REVIEW'
            ? 'Cancelled. We are processing your refund and will update you shortly.'
            : 'Cancellation confirmed.'
      );
    } catch (e: any) {
      const message = e?.message || 'Cancellation could not be confirmed.';
      setConfirming(false);
      setError(
        `${message} If the outcome is unknown, please do not retry. Contact StableBus support to verify the provider status.`
      );
    } finally {
      setBusy(false);
    }
  };

  /* ---------- list card ---------- */

  const renderBooking = (booking: Booking) => {
    const bus = ((booking.boarding_point as any)?._bus || {}) as Record<string, string>;
    const from = cityName(booking.source_city_id, bus.source_city_name);
    const to = cityName(booking.destination_city_id, bus.destination_city_name);
    const boarding = getPointDetails(booking.boarding_point, 'boarding');
    const dropping = getPointDetails(booking.dropping_point, 'dropping');
    const seats = (booking.seat_numbers || []).map(String);
    const done = isCancelled(booking);
    const operator = booking.operator_name || bus.operator_name || '';
    const busType = (booking as any).bus_type || bus.bus_type || '';
    const departs = formatClock(bus.departure_time) || boarding.time || '';
    const arrives = formatClock(bus.arrival_time) || dropping.time || '';

    return (
      <Pressable
        key={booking.booking_id}
        style={[styles.card, done && styles.cardMuted]}
        onPress={() => openDetails(booking)}
        accessibilityRole="button"
      >
        <View style={styles.cardTop}>
          <View style={styles.busIcon}>
            <Ionicons name="bus-outline" size={20} color={C.burgundy} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.operator} numberOfLines={1}>{operator || 'Operator not recorded'}</Text>
            {!!busType && <Text style={styles.busType} numberOfLines={1}>{busType}</Text>}
          </View>
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>{dateLabel(booking.journey_date)}</Text>
          </View>
        </View>

        <View style={styles.routeRow}>
          <View style={styles.routeStop}>
            <Text style={styles.routeClock}>{departs || '--'}</Text>
            <Text style={styles.routeCity} numberOfLines={1}>{from}</Text>
          </View>

          <View style={styles.routeMiddle}>
            <View style={styles.routeDot} />
            <View style={styles.routeDash} />
            <Ionicons name="bus-outline" size={15} color={C.burgundy} />
            <View style={styles.routeDash} />
            <View style={styles.routeDot} />
          </View>

          <View style={[styles.routeStop, { alignItems: 'flex-end' }]}>
            <Text style={styles.routeClock}>{arrives || '--'}</Text>
            <Text style={styles.routeCity} numberOfLines={1}>{to}</Text>
          </View>
        </View>

        <View style={styles.tear}>
          <View style={[styles.notch, { left: -10 }]} />
          <View style={styles.tearLine} />
          <View style={[styles.notch, { right: -10 }]} />
        </View>

        <View style={styles.pointsRow}>
          <View style={styles.pointCol}>
            <View style={styles.pointLabelRow}>
              <Ionicons name="location-outline" size={14} color={C.burgundy} />
              <Text style={styles.meta}>Boarding</Text>
            </View>
            <Text style={styles.pointName} numberOfLines={2}>{boarding.name}</Text>
            {!!boarding.time && <Text style={styles.pointTime}>{boarding.time}</Text>}
          </View>
          <View style={styles.pointCol}>
            <View style={styles.pointLabelRow}>
              <Ionicons name="flag-outline" size={14} color={C.burgundy} />
              <Text style={styles.meta}>Dropping</Text>
            </View>
            <Text style={styles.pointName} numberOfLines={2}>{dropping.name}</Text>
            {!!dropping.time && <Text style={styles.pointTime}>{dropping.time}</Text>}
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.seatRow}>
            <Text style={styles.meta}>{seats.length === 1 ? 'Seat' : 'Seats'}</Text>
            <View style={styles.seatTags}>
              {seats.slice(0, 4).map(seat => (
                <View key={seat} style={styles.seatTag}>
                  <Text style={styles.seatTagText}>{seat}</Text>
                </View>
              ))}
              {seats.length > 4 && <Text style={styles.meta}>+{seats.length - 4}</Text>}
            </View>
          </View>
          <Text style={styles.amount}>{money(booking.total_amount, booking.currency)}</Text>
        </View>
        <View style={styles.statusLine}>
          <StatusPill status={booking.booking_status} />
        </View>
        <CoinBanners booking={booking} />
        {rateRow(booking)}
      </Pressable>
    );
  };

  const renderPassenger = (passenger: BookingPassenger, index: number) => (
    <View key={`${passenger.seat_number}-${index}`}>
      {index > 0 && <View style={styles.hairline} />}
      <View style={styles.passengerRow}>
        <View style={styles.seatChip}>
          <Text style={styles.seatChipText} numberOfLines={1}>{passenger.seat_number}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.passengerName} numberOfLines={1}>{passenger.name}</Text>
          <Text style={styles.meta}>
            {passenger.age ? `${passenger.age} yrs` : ''}
            {passenger.age && passenger.ticket_number ? ' · ' : ''}
            {passenger.ticket_number ? `Ticket ${passenger.ticket_number}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );

  const activePassengers = (cancelBooking?.passengers || []).filter(
    passenger =>
      !(cancelBooking?.cancelled_seat_numbers || []).includes(String(passenger.seat_number))
  );

  const detailsBoarding = details ? getPointDetails(details.boarding_point, 'boarding') : null;
  const detailsDropping = details ? getPointDetails(details.dropping_point, 'dropping') : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* soft scenic wash behind the header, melting into the page */}
      <View pointerEvents="none" style={[styles.wash, { height: insets.top + 150 }]}>
        <Image
          source={require('@/assets/scenic/scenic_bg.jpg')}
          style={styles.washImage}
          resizeMode="cover"
        />
        <EdgeFade edge="bottom" height={insets.top + 110} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={C.ink} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Your bookings</Text>
          <Text style={styles.subheading}>All your journeys in one place</Text>
        </View>

        <Pressable onPress={() => load(true)} style={styles.iconButton} accessibilityLabel="Refresh">
          <Ionicons name="refresh-outline" size={19} color={C.burgundy} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            { key: 'upcoming', label: 'Upcoming', count: upcoming.length, flex: 1 },
            { key: 'completed', label: 'Completed', count: completed.length, flex: 1.1 },
            { key: 'other', label: 'Pending & cancelled', count: other.length, flex: 1.7 },
          ] as const
        ).map(item => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.tab, { flex: item.flex }, active && styles.activeTab]}
            >
              <Text style={[styles.tabText, active && styles.activeTabText]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.tabCount, active && styles.activeTabCount]}>{item.count}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading || !citiesReady ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.burgundy} size="large" />
          <Text style={styles.emptyText}>Loading your journeys…</Text>
        </View>
      ) : error && !items.length ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cloud-offline-outline" size={26} color={C.burgundy} />
          </View>
          <Text style={styles.emptyTitle}>We couldn't load your bookings</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 30 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.burgundy} />
          }
          showsVerticalScrollIndicator={false}
        >
          {visible.length ? (
            visible.map(renderBooking)
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="ticket-outline" size={26} color={C.burgundy} />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === 'upcoming'
                  ? 'No upcoming journeys'
                  : tab === 'completed'
                    ? 'No past journeys yet'
                    : 'Nothing pending or cancelled'}
              </Text>
              <Text style={styles.emptyText}>
                {tab === 'upcoming'
                  ? 'When you book a bus, your ticket will wait for you here.'
                  : tab === 'completed'
                    ? 'Journeys you have completed will appear here.'
                    : 'Bookings that are waiting for payment or were cancelled will appear here.'}
              </Text>
              {tab === 'upcoming' && (
                <Pressable onPress={() => router.back()} style={styles.softButton}>
                  <Text style={styles.softButtonText}>Plan a journey</Text>
                  <Ionicons name="arrow-forward" size={15} color={C.burgundy} />
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}

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
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}

      <RateTripSheet
        target={rateTarget}
        rewardCoins={rewardCoins}
        onClose={() => setRateTarget(null)}
        onDone={(bookingId, rating, coins) => {
          setRatings(prev => ({ ...prev, [bookingId]: rating }));
          setRateTarget(null);
          showToast(coins > 0 ? `Thank you! ${coins} coins added to your wallet.` : 'Thank you for rating your trip.');
        }}
      />

      {/* Booking details */}
      <Modal
        visible={!!details}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDetails(null)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetails(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Booking details</Text>
              </View>

              <Pressable onPress={() => setDetails(null)} style={styles.closeButton} accessibilityLabel="Close">
                <Ionicons name="close" size={19} color={C.ink} />
              </Pressable>
            </View>

            {details && detailsBoarding && detailsDropping && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.detailRoute}>
                      {cityName(details.source_city_id)} → {cityName(details.destination_city_id)}
                    </Text>
                    <Text style={styles.date}>{dateLabel(details.journey_date)}</Text>
                  </View>
                  <StatusPill status={details.booking_status} />
                </View>

                {/* journey timeline */}
                <View style={styles.panel}>
                  <View style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      <View style={styles.timelineLine} />
                    </View>
                    <View style={styles.timelineBody}>
                      <Text style={styles.infoLabel}>Boarding</Text>
                      <Text style={styles.infoValue}>{detailsBoarding.name}</Text>
                      {!!detailsBoarding.time && <Text style={styles.timeText}>{detailsBoarding.time}</Text>}
                      {!!detailsBoarding.address && <Text style={styles.meta}>{detailsBoarding.address}</Text>}
                    </View>
                  </View>

                  <View style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, styles.timelineDotEnd]} />
                    </View>
                    <View style={styles.timelineBody}>
                      <Text style={styles.infoLabel}>Dropping</Text>
                      <Text style={styles.infoValue}>{detailsDropping.name}</Text>
                      {!!detailsDropping.time && <Text style={styles.timeText}>{detailsDropping.time}</Text>}
                      {!!detailsDropping.address && <Text style={styles.meta}>{detailsDropping.address}</Text>}
                    </View>
                  </View>
                </View>

                {/* key facts */}
                <View style={styles.panel}>
                  <View style={styles.factRow}>
                    <Text style={styles.factLabel}>Transport PNR</Text>
                    <Text style={styles.factValue}>{details.transport_pnr || 'Not available'}</Text>
                  </View>
                  <View style={styles.hairline} />
                  <View style={styles.factRow}>
                    <Text style={styles.factLabel}>Bus operator</Text>
                    <Text style={[styles.factValue, !details.operator_name && styles.factMissing]} numberOfLines={2}>
                      {details.operator_name || 'Not recorded'}
                    </Text>
                  </View>
                  <View style={styles.hairline} />
                  <View style={styles.factRow}>
                    <Text style={styles.factLabel}>Amount</Text>
                    <Text style={styles.factValueStrong}>{money(details.total_amount, details.currency)}</Text>
                  </View>
                </View>

                <CoinBanners booking={details} />
                {rateRow(details)}

                <Text style={styles.sectionTitle}>Passengers</Text>
                <View style={styles.panel}>
                  {(details.passengers || []).length ? (
                    (details.passengers || []).map(renderPassenger)
                  ) : (
                    <Text style={styles.meta}>Passenger details are not available.</Text>
                  )}
                </View>

                {!!details.cancelled_seat_numbers?.length && (
                  <Text style={styles.cancelledNote}>
                    Cancelled seats: {details.cancelled_seat_numbers.join(', ')}
                  </Text>
                )}

                <Pressable style={styles.outlineButton} onPress={() => shareTicket(details)}>
                  <Ionicons name="share-social-outline" size={17} color={C.burgundy} />
                  <Text style={styles.outlineButtonText}>Share booking details</Text>
                </Pressable>
                {!!shareError && <Text style={styles.inlineNote}>{shareError}</Text>}

                {/* No cancellation button on completed journeys */}
                {tab === 'upcoming' && canCancel(details) && (
                  <Pressable style={styles.quietDanger} onPress={() => openCancellation(details)}>
                    <Text style={styles.quietDangerText}>Cancel passengers</Text>
                  </Pressable>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Passenger cancellation */}
      <Modal
        visible={!!cancelBooking}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeCancellation}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCancellation} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Cancel passengers</Text>
                <Text style={styles.subheading}>
                  {quote ? 'Review the provider’s response' : 'Select the seats you want to cancel'}
                </Text>
              </View>

              <Pressable
                disabled={busy}
                onPress={closeCancellation}
                style={styles.closeButton}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={19} color={C.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!quote ? (
                activePassengers.map(passenger => {
                  const seat = String(passenger.seat_number);
                  const checked = selectedSeats.includes(seat);

                  return (
                    <Pressable
                      key={seat}
                      style={[styles.selectPassenger, checked && styles.selectPassengerOn]}
                      onPress={() => toggleSeat(seat)}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                        {checked && <Ionicons name="checkmark" size={14} color={C.white} />}
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.passengerName} numberOfLines={1}>{passenger.name}</Text>
                        <Text style={styles.meta}>Seat {seat}</Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.panel}>
                  <Text style={styles.quoteNote}>
                    This is exactly what the bus provider replied. StableBus does not estimate the refund amount.
                  </Text>

                  {getQuoteSummary(quote).map(([key, value]) => (
                    <View key={key} style={styles.quoteRow}>
                      <Text style={styles.factLabel}>{humanKey(key)}</Text>
                      <Text style={styles.quoteValue}>
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {!!error && <Text style={styles.error}>{error}</Text>}

              {!quote ? (
                <Pressable
                  disabled={!selectedSeats.length || busy}
                  style={[styles.primaryButton, (!selectedSeats.length || busy) && styles.disabledButton]}
                  onPress={requestQuote}
                >
                  {busy ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Check cancellation charges</Text>
                  )}
                </Pressable>
              ) : confirming ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>
                    Cancel {selectedSeats.length} passenger{selectedSeats.length === 1 ? '' : 's'}?
                  </Text>
                  <Text style={styles.confirmText}>This can’t be undone once the provider confirms it.</Text>

                  <View style={styles.confirmActions}>
                    <Pressable
                      disabled={busy}
                      style={styles.confirmKeep}
                      onPress={() => setConfirming(false)}
                    >
                      <Text style={styles.confirmKeepText}>Keep booking</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      style={[styles.confirmCancel, busy && styles.disabledButton]}
                      onPress={submitCancellation}
                    >
                      {busy ? (
                        <ActivityIndicator color={C.white} />
                      ) : (
                        <Text style={styles.confirmCancelText}>Yes, cancel</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View>
                  <Pressable
                    disabled={busy}
                    style={[styles.primaryButton, styles.dangerSolid, busy && styles.disabledButton]}
                    onPress={() => setConfirming(true)}
                  >
                    <Text style={styles.primaryButtonText}>Continue to cancel</Text>
                  </Pressable>

                  <Pressable disabled={busy} style={styles.textButton} onPress={() => setQuote(null)}>
                    <Text style={styles.textButtonLabel}>Change selected passengers</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  wash: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  washImage: { width: '100%', height: '100%', opacity: 0.55 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,254,252,0.9)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { color: C.ink, fontSize: 20, fontWeight: '500' },
  subheading: { color: C.muted, fontSize: 12.5, marginTop: 3 },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 12,
    backgroundColor: '#EFE9E2',
    borderRadius: 15,
    padding: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: C.paper,
    shadowColor: '#783D4A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabText: { color: C.muted, fontSize: 13, flexShrink: 1 },
  activeTabText: { color: C.burgundy, fontWeight: '500' },
  tabCount: { color: C.muted, fontSize: 12 },
  activeTabCount: { color: C.burgundy },

  list: { paddingHorizontal: 18, paddingTop: 6, gap: 14 },

  /* booking card */
  card: {
    backgroundColor: C.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 14,
    shadowColor: '#783D4A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardMuted: { opacity: 0.88 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  date: { color: C.muted, fontSize: 13, marginTop: 3 },
  operator: { color: C.burgundy, fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
  busIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.burgundyLight, alignItems: 'center', justifyContent: 'center' },
  busType: { color: C.muted, fontSize: 12, marginTop: 3 },
  datePill: { paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: C.burgundyLight, justifyContent: 'center' },
  datePillText: { color: C.burgundy, fontSize: 12, fontWeight: '500' },
  routeClock: { color: C.ink, fontSize: 18, fontWeight: '600' },
  pointsRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  pointCol: { flex: 1, minWidth: 0 },
  pointLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pointName: { color: C.ink, fontSize: 14, fontWeight: '600', marginTop: 5 },
  pointTime: { color: C.burgundy, fontSize: 13, marginTop: 3 },
  statusLine: { flexDirection: 'row', marginTop: 12 },
  coinBannerStack: {
    marginTop: 12,
    paddingTop: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  coinBanner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinBannerCoin: { width: 18, height: 18 },
  coinBannerWallet: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  coinBannerTitle: { flex: 1, minWidth: 0, color: C.muted, fontSize: 12.5, lineHeight: 17 },
  coinBannerCaption: { color: C.muted, fontSize: 12.5, fontWeight: '400' },
  coinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EDC25A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  status: { fontSize: 12, fontWeight: '500' },

  routeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  routeStop: { flex: 1, minWidth: 0 },
  routeCity: { color: C.muted, fontSize: 13, marginTop: 4 },
  routeTime: { color: C.muted, fontSize: 12.5, marginTop: 4 },
  routeMiddle: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.burgundy },
  routeDash: { flex: 1, height: 1, backgroundColor: C.border, marginHorizontal: 3 },

  tear: { height: 22, marginTop: 14, marginHorizontal: -16, justifyContent: 'center' },
  tearLine: { marginHorizontal: 16, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: '#DCCFC4' },
  notch: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    top: 1,
  },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  seatRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  seatTags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  seatTag: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatTagText: { color: C.burgundy, fontSize: 12.5, fontWeight: '500' },
  meta: { color: C.muted, fontSize: 12.5 },
  amount: { color: C.ink, fontSize: 16, fontWeight: '500' },

  /* states */
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 28 },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '500', textAlign: 'center' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  softButton: {
    marginTop: 20,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: C.burgundyLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  softButtonText: { color: C.burgundy, fontSize: 14, fontWeight: '500' },
  retryButton: {
    marginTop: 18,
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: C.white, fontSize: 14, fontWeight: '500' },

  /* sheets */
  overlay: { flex: 1, backgroundColor: 'rgba(40,30,28,0.32)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: C.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#DDD2C8', alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  sheetTitle: { color: C.ink, fontSize: 18, fontWeight: '500' },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  detailRoute: { color: C.ink, fontSize: 19, fontWeight: '500', marginBottom: 4 },

  panel: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginTop: 12,
  },
  hairline: { height: 1, backgroundColor: C.border },

  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { width: 14, alignItems: 'center', paddingTop: 4 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.burgundy },
  timelineDotEnd: { backgroundColor: C.paper, borderWidth: 2, borderColor: C.burgundy },
  timelineLine: { flex: 1, width: 1, backgroundColor: '#DCCFC4', marginVertical: 3 },
  timelineBody: { flex: 1, minWidth: 0, paddingBottom: 14 },
  infoLabel: { color: C.muted, fontSize: 12.5 },
  infoValue: { color: C.ink, fontSize: 15, marginTop: 3 },
  timeText: { color: C.burgundy, fontSize: 13.5, marginTop: 3 },

  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: 44 },
  factLabel: { color: C.muted, fontSize: 13.5 },
  factValue: { color: C.ink, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  factMissing: { color: C.muted },
  factValueStrong: { color: C.ink, fontSize: 16, fontWeight: '500' },

  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '500', marginTop: 20 },
  passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  seatChip: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatChipText: { color: C.burgundy, fontSize: 13, fontWeight: '500' },
  passengerName: { color: C.ink, fontSize: 14.5 },
  cancelledNote: { color: C.danger, fontSize: 13, marginTop: 12 },

  outlineButton: {
    height: 50,
    borderWidth: 1,
    borderColor: '#DCC3C8',
    backgroundColor: C.paper,
    borderRadius: 14,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  outlineButtonText: { color: C.burgundy, fontSize: 14.5, fontWeight: '500' },
  inlineNote: { color: C.danger, fontSize: 13, marginTop: 8, textAlign: 'center' },
  quietDanger: {
    height: 48,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: C.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietDangerText: { color: C.danger, fontSize: 14.5, fontWeight: '500' },

  /* cancellation */
  selectPassenger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
    backgroundColor: C.paper,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  selectPassengerOn: { backgroundColor: C.burgundyLight, borderColor: '#DCC3C8' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#CFC3B9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: C.burgundy, borderColor: C.burgundy },
  quoteNote: { color: C.muted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  quoteRow: { borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11, gap: 4 },
  quoteValue: { color: C.ink, fontSize: 14, lineHeight: 20 },
  error: { color: C.danger, fontSize: 13.5, lineHeight: 20, marginTop: 14 },

  primaryButton: {
    backgroundColor: C.burgundy,
    borderRadius: 14,
    marginTop: 18,
    marginBottom: 8,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: C.white, fontSize: 15, fontWeight: '500' },
  disabledButton: { opacity: 0.45 },
  dangerSolid: { backgroundColor: C.danger },
  textButton: { alignItems: 'center', padding: 14 },
  textButtonLabel: { color: C.burgundy, fontSize: 14, fontWeight: '500' },

  confirmBox: {
    marginTop: 18,
    marginBottom: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.dangerLight,
  },
  confirmTitle: { color: C.ink, fontSize: 16, fontWeight: '500' },
  confirmText: { color: C.muted, fontSize: 13.5, lineHeight: 20, marginTop: 5 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  confirmKeep: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmKeepText: { color: C.ink, fontSize: 14.5 },
  confirmCancel: {
    flex: 1,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: { color: C.white, fontSize: 14.5, fontWeight: '500' },

  /* toast */
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
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: { flexShrink: 1, color: '#fff', fontSize: 14 },
});