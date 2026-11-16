import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { request } from '@/services/http';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyDark: '#65313E',
  burgundyLight: '#F4EAEB',
  green: '#47765B',
  red: '#B8453F',
};

type Passenger = {
  title?: string;
  name?: string;
  age?: number;
  gender?: string;
  date_of_birth?: string;
  seat?: string;
  seatKey?: string;
  passenger_id?: string;
};

type ApiResponse = {
  booking_id?: string;
  guest_access_token?: string;
  total_amount?: string;
  currency?: string;
  payment_id?: string;
  gateway_order_id?: string;
  amount?: string;
  status?: string;
  booking_status?: string;
  message?: string;
};

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function firstParam(params: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = params[key];
    const result = Array.isArray(value) ? value[0] : value;

    if (result !== undefined && result !== null && String(result).trim()) {
      return String(result);
    }
  }

  return '';
}

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function formatAmount(value: number): string {
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // Existing search UI uses MM/DD/YYYY.
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error('Invalid journey date. Please go back and select the date again.');
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

function formatClock(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/am|pm/i.test(v)) return v.toUpperCase();
  const match = v.match(/(\d{1,2}):(\d{2})/);
  if (!match) return v;
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

// Operators send their contact numbers themselves, so they are never displayed.
const PHONE_RE = /(?:\+?\d{1,3}[\s-]*)?(?:\d[\s-]?){8,11}\d/g;

function getPointName(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return 'Not selected';
  const raw = String(
    point?.[`${type}_Name`] ?? point?.[`${type}Name`] ?? point?.point_Name ?? point?.pointName ?? point?.name ?? ''
  );
  const clean = raw
    .split('^')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(PHONE_RE, '')
    .replace(/\s*[-,:;/&]+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean || 'Selected point';
}

function getPointTime(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return '';
  return formatClock(String(point?.[`${type}_Time`] ?? point?.time ?? ''));
}

function prettyChargeLabel(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return 'Taxes & fees';
  if (/^[A-Z]{2,6}$/.test(text)) return text; // GST, CGST, SGST, IGST
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Booking, payment and ticketing talk to the bus provider and can take well over 15 seconds.
const LONG_TIMEOUT_MS = 90000;

function getApiError(error: any): string {
  return error?.message || 'Something went wrong. Please try again.';
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
    // onRequestClose is a no-op so the Android back button cannot interrupt a booking in progress.
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.loaderScreen}>
        <Text style={styles.loaderTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.loaderSubtitle}>{subtitle}</Text>}
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

export default function Payment() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const bus = useMemo(() => parseJson(params.bus) || {}, [params.bus]);
  const passengers = useMemo(
    () => parseJson(params.passengers) || [],
    [params.passengers]
  ) as Passenger[];

  const contact = useMemo(
    () => parseJson(params.contact) || {},
    [params.contact]
  );

  const selectedSeats = useMemo(
    () => parseJson(params.selectedSeats) || [],
    [params.selectedSeats]
  );

  const boarding = useMemo(
    () => parseJson(params.selectedBoardingPoint) || {},
    [params.selectedBoardingPoint]
  );

  const dropping = useMemo(
    () => parseJson(params.selectedDroppingPoint) || {},
    [params.selectedDroppingPoint]
  );

  const fare = Number(
    Array.isArray(params.totalFare) ? params.totalFare[0] : params.totalFare
  ) || 0;

  const from = firstParam(params, ['from']);
  const to = firstParam(params, ['to']);
  const journeyDate = firstParam(params, ['date']);

  const busName =
    bus.operator_Name ||
    bus.travel_Name ||
    'Selected bus';

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [finalMessage, setFinalMessage] = useState('');

  const [guestToken, setGuestToken] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [gatewayOrderId, setGatewayOrderId] = useState('');

  // Keep the same keys if the user retries an uncertain network operation.
  const [bookingIdempotencyKey] = useState(() =>
    makeIdempotencyKey('booking')
  );
  const [paymentIdempotencyKey] = useState(() =>
    makeIdempotencyKey('payment')
  );

  const insets = useSafeAreaInsets();

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

  // After an uncertain payment result the button stays off, so nobody pays twice.
  const [locked, setLocked] = useState(false);

  /**
   * Fare breakdown from the seats' own fare data: base fare + each tax/charge, adding up to the
   * amount that is actually charged (`totalFare`). Nothing is invented: anything the seat data does
   * not explain is shown as one "Taxes & fees" line.
   */
  const breakdown = useMemo(() => {
    const num = (v: any) => Number(v) || 0;
    let base = 0;
    let seatTotal = 0;
    const lines = new Map<string, number>();

    for (const seat of selectedSeats as any[]) {
      const fm = seat?.fareMaster;
      if (!fm) continue;
      base += num(fm.basic_Amount);
      seatTotal += num(fm.total_Amount);

      const details = Array.isArray(fm.fareDetails) ? fm.fareDetails : [];
      for (const d of details) {
        const amount = num(d?.amount);
        if (amount > 0) {
          const label = prettyChargeLabel(d?.fare_Desc);
          lines.set(label, (lines.get(label) || 0) + amount);
        }
      }
      if (num(fm.gst) > 0 && !lines.has('GST')) lines.set('GST', (lines.get('GST') || 0) + num(fm.gst));
      if (num(fm.service_Fee_Amount) > 0) {
        lines.set('Service fee', (lines.get('Service fee') || 0) + num(fm.service_Fee_Amount));
      }
    }

    const payable = fare > 0 ? fare : seatTotal;
    if (base <= 0) return { base: payable, charges: [] as { label: string; amount: number }[] };

    let charges = [...lines.entries()].map(([label, amount]) => ({ label, amount }));
    const extra = Math.round((payable - base) * 100) / 100;
    const listed = Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

    if (Math.abs(extra - listed) > 0.01) {
      charges = extra > 0.009 ? [{ label: 'Taxes & fees', amount: extra }] : [];
    }
    return { base: extra > 0.009 || charges.length ? base : payable, charges };
  }, [selectedSeats, fare]);

  const amountLabel = formatAmount(fare);

 
function getBookingPayload() {
  const sourceCityId = firstParam(params, [
    'source_city_id',
    'sourceCityId',
    'from_city_id',
    'fromCityId',
  ]);

  const destinationCityId = firstParam(params, [
    'destination_city_id',
    'destinationCityId',
    'to_city_id',
    'toCityId',
  ]);

  const busId =
    bus.bus_Key ||
    bus.bus_Key_Id ||
    firstParam(params, ['bus_id', 'busId']);

  const searchKey = firstParam(params, [
    'search_key',
    'searchKey',
  ]);

  const boardingId =
    boarding.boarding_Id ||
    boarding.boarding_id ||
    boarding.point_Id ||
    firstParam(params, ['boarding_id', 'boardingId']);

  const droppingId =
    dropping.dropping_Id ||
    dropping.dropping_id ||
    dropping.point_Id ||
    firstParam(params, ['dropping_id', 'droppingId']);

  const customerMobile = String(contact.mobile || '').trim();
  const passengerEmail = String(contact.email || '').trim();

  const missing = [
    ['customer mobile', customerMobile],
    ['passenger email', passengerEmail],
    ['source city ID', sourceCityId],
    ['destination city ID', destinationCityId],
    ['bus ID', busId],
    ['search key', searchKey],
    ['boarding point ID', boardingId],
    ['dropping point ID', droppingId],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new Error(
      `Missing booking information: ${missing
        .map(([name]) => name)
        .join(', ')}. Please go back and retry.`
    );
  }

  if (!passengers.length) {
    throw new Error('Passenger information is missing.');
  }

  const passengerRequests = passengers.map((p) => {
    const seatKey =
      p.seatKey ||
      selectedSeats.find((s: any) =>
        String(s.seat_Number ?? s.seat_Name ?? s.seatNo ?? '') ===
        String(p.seat)
      )?.seat_Key;

    if (!seatKey) {
      throw new Error(`Seat key missing for seat ${p.seat || ''}.`);
    }

    if (p.passenger_id) {
      return {
        passenger_id: p.passenger_id,
        seat_key: seatKey,
        title: p.title,
      };
    }

    return {
      name: p.name,
      age: Number(p.age),
      gender: p.gender,
      seat_key: seatKey,
      title: p.title,
      ...(p.date_of_birth
        ? { dob: p.date_of_birth }
        : {}),
    };
  });

  return {
    idempotency_key: bookingIdempotencyKey,
    customer_mobile: customerMobile,
    passenger_email: passengerEmail,
    source_city_id: sourceCityId,
    destination_city_id: destinationCityId,
    journey_date: toIsoDate(journeyDate),
    bus_id: String(busId),
    search_key: searchKey,
    boarding_id: String(boardingId),
    dropping_id: String(droppingId),
    // Preserve the complete selected points for the confirmation email.
  boarding_point: boarding,
  dropping_point: dropping,
    passengers: passengerRequests,

  };
}


  async function createBooking(): Promise<ApiResponse> {
    setStep('Reserving your seats');

    const payload = getBookingPayload();

    const result = await request<ApiResponse>(
      '/api/v1/bookings',
      {
        method: 'POST',
        timeoutMs: LONG_TIMEOUT_MS,
        body: JSON.stringify(payload),
      }
    );

    if (!result.booking_id) {
      throw new Error('Booking service did not return a booking ID.');
    }

    setBookingId(result.booking_id);

    if (result.guest_access_token) {
      setGuestToken(result.guest_access_token);
    }

    return result;
  }

  /**
   * Creates the booking. If the server answers 409 (the same request is still being processed) or the
   * call timed out, the SAME idempotency key is sent again after a short wait, so the server hands
   * back the original booking instead of creating a second one.
   */
  async function createBookingSafely(): Promise<ApiResponse> {
    let lastError: any;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await createBooking();
      } catch (error: any) {
        lastError = error;
        if (error?.status !== 409 && !error?.isTimeout) throw error;
        setStep('Confirming your seats');
        await new Promise(resolve => setTimeout(resolve, 2500 * (attempt + 1)));
      }
    }

    throw lastError;
  }

  async function initiatePayment(
    id: string,
    guestAccessToken: string
  ): Promise<ApiResponse> {
    setStep('Preparing secure payment');

    const result = await request<ApiResponse>(
      `/api/v1/bookings/${id}/payments`,
      {
        method: 'POST',
        timeoutMs: LONG_TIMEOUT_MS,
        headers: guestAccessToken
          ? { 'X-Guest-Access-Token': guestAccessToken }
          : undefined,
        body: JSON.stringify({
          idempotency_key: paymentIdempotencyKey,
        }),
      }
    );

    if (result.status !== 'PENDING' || !result.payment_id || !result.gateway_order_id) {
      throw new Error(
        result.message || `Payment order is not ready (${result.status || 'UNKNOWN'}).`
      );
    }

    setPaymentId(result.payment_id);
    setGatewayOrderId(result.gateway_order_id);

    return result;
  }

  async function verifyPayment(
    id: string,
    guestAccessToken: string,
    stablePaymentId: string,
    razorpayPaymentId: string,
    signature: string
  ): Promise<ApiResponse> {
    setStep('Verifying your payment');

    return request<ApiResponse>(
      `/api/v1/bookings/${id}/payments/verify`,
      {
        method: 'POST',
        timeoutMs: LONG_TIMEOUT_MS,
        headers: guestAccessToken
          ? { 'X-Guest-Access-Token': guestAccessToken }
          : undefined,
        body: JSON.stringify({
          payment_id: stablePaymentId,
          gateway_payment_id: razorpayPaymentId,
          signature,
        }),
      }
    );
  }

  async function submitTicketing(
    id: string,
    guestAccessToken: string
  ): Promise<ApiResponse> {
    setStep('Confirming your bus ticket');

    const headers = guestAccessToken
      ? { 'X-Guest-Access-Token': guestAccessToken }
      : undefined;

    await request<ApiResponse>(
      `/api/v1/bookings/${id}/ticketing`,
      { method: 'POST', headers, timeoutMs: LONG_TIMEOUT_MS }
    );

    return request<ApiResponse>(
      `/api/v1/bookings/${id}/requery`,
      { method: 'POST', headers, timeoutMs: LONG_TIMEOUT_MS }
    );
  }

  async function handlePay() {
    if (loading) return;

    if (Platform.OS === 'web') {
      showToast('Please open the mobile app to pay.');
      return;
    }

    const razorpayKey = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

    if (!razorpayKey) {
      showToast('Payments are not set up in this build yet.');
      console.warn('[Payment] Add EXPO_PUBLIC_RAZORPAY_KEY_ID to your mobile app environment.');
      return;
    }

    if (!fare || fare <= 0) {
      showToast('The booking amount is not valid. Please go back and try again.');
      return;
    }

    setLoading(true);
    setFinalMessage('');

    // Which step we are in decides how a failure is explained (and whether paying again is safe).
    let stage: 'booking' | 'order' | 'checkout' | 'verify' | 'ticket' = 'booking';

    try {
      // Step 1: Create the temporary bus booking.
      let created: ApiResponse;

      if (bookingId) {
        created = { booking_id: bookingId, guest_access_token: guestToken };
      } else {
        created = await createBookingSafely();
      }

      const id = created.booking_id!;
      const token = created.guest_access_token || guestToken;

      stage = 'order';
      // Step 2: Create the Razorpay order through StableBus backend.
      let payment = paymentId && gatewayOrderId
        ? {
            payment_id: paymentId,
            gateway_order_id: gatewayOrderId,
            amount: String(fare),
            currency: 'INR',
            status: 'PENDING',
          } as ApiResponse
        : await initiatePayment(id, token);

      const keyAmount = Math.round(Number(payment.amount) * 100);

      if (!Number.isFinite(keyAmount) || keyAmount <= 0) {
        throw new Error('Backend returned an invalid payment amount.');
      }

      // Step 3: Open Razorpay native checkout.
      stage = 'checkout';
      setStep('Waiting for payment');

      // The full-screen loader is a native Modal. Razorpay's own screen must not launch while that
      // Modal is still closing, or Android swallows it. Give the Modal time to disappear first.
      await new Promise(resolve => setTimeout(resolve, 700));

      // react-native-razorpay is a native module and is unavailable in Expo Go.
      // Check it before calling .open() so the user gets an actionable message.
      const razorpayModule = RazorpayCheckout as
        | { open?: (options: Record<string, any>) => Promise<any> }
        | null
        | undefined;

      if (!razorpayModule || typeof razorpayModule.open !== 'function') {
        throw new Error(
          'Razorpay native SDK is unavailable in this app build. Install and run a rebuilt Android/iOS development build containing react-native-razorpay. Your temporary booking and payment order have already been created; retrying on this screen will reuse them.'
        );
      }

      let checkout: any;
      try {
        checkout = await razorpayModule.open({
          key: razorpayKey,
          order_id: payment.gateway_order_id!,
          amount: String(keyAmount),
          currency: payment.currency || 'INR',
          name: 'StableBus',
          description: `${from} to ${to}`,
          prefill: {
            contact: String(contact.mobile || ''),
            email: String(contact.email || ''),
          },
          theme: {
            color: C.burgundy,
          },
        });
      } catch (openError: any) {
        if (/of null|undefined/i.test(String(openError?.message))) {
          throw new Error('Payments are not available in this app build. Please install the latest development build of StableBus.');
        }
        throw openError;
      }

      const razorpayPaymentId = checkout.razorpay_payment_id;
      const signature = checkout.razorpay_signature;

      if (!razorpayPaymentId || !signature) {
        throw new Error('Razorpay did not return payment verification details.');
      }

      // Step 4: Backend verifies signature and captured amount.
      stage = 'verify';
      const verified = await verifyPayment(
        id,
        token,
        payment.payment_id!,
        razorpayPaymentId,
        signature
      );

      if (verified.status !== 'SUCCESS') {
        setFinalMessage(
          'Payment is not confirmed yet. Please do not pay again. We are checking its status.'
        );
        setLocked(true);
        return;
      }

      // Step 5: Ask the bus provider to issue the ticket, then open
      // the ticket screen for both confirmed and still-pending outcomes.
      stage = 'ticket';
      const ticket = await submitTicketing(id, token);

      router.replace({
        pathname: '/tickets',
        params: {
          bookingId: id,
          guestToken: token,
          bookingStatus: ticket.booking_status || 'TICKETING_UNKNOWN',
          transportPnr: ticket.transport_pnr || '',
          supplierRef: ticket.supplier_refno || '',
          from,
          to,
          date: journeyDate,
          totalFare: String(fare),
          currency: ticket.currency || 'INR',
          bus: JSON.stringify(bus),
          passengers: JSON.stringify(passengers),
          selectedBoardingPoint: JSON.stringify(boarding),
          selectedDroppingPoint: JSON.stringify(dropping),
        },
      });
    } catch (error: any) {
      console.log('[Payment] failed at stage:', stage, JSON.stringify(error), error?.message);
      const raw = getApiError(error);
      const cancelled =
        String(raw).toLowerCase().includes('cancel') || error?.code === 'PAYMENT_CANCELLED';

      if (cancelled) {
        // Razorpay cancellation is not a failure: nothing was charged and paying again is fine.
        setFinalMessage('Payment was cancelled. Your booking has not been confirmed.');
      } else if (stage === 'verify' || stage === 'ticket') {
        // Money may already have been taken: never invite a second payment.
        setFinalMessage(
          'We are still confirming your payment and ticket. Please do not pay again. You will receive your ticket shortly.'
        );
        setLocked(true);
      } else if (error?.status === 409) {
        setFinalMessage(
          'These seats are still on hold from an earlier attempt, or were just taken. Please wait a minute and try again, or go back and choose your seats again.'
        );
      } else if (error?.isTimeout) {
        setFinalMessage('The server is taking longer than usual. Please try again in a moment.');
      } else {
        setFinalMessage(raw);
      }
    } finally {
      setLoading(false);
      setStep('');
    }
  }

  const sheetBottom = 12 + insets.bottom;
  const seatNames = passengers.map(p => p.seat).filter(Boolean) as string[];
  const dateLabel = formatDate(journeyDate);
  const boardingName = getPointName(boarding, 'boarding');
  const droppingName = getPointName(dropping, 'dropping');
  const boardingTime = getPointTime(boarding, 'boarding');
  const droppingTime = getPointTime(dropping, 'dropping');
  const payBlocked = loading || locked;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={[styles.header, { paddingTop: 10 + insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} disabled={loading}>
          <Ionicons name="arrow-back" size={21} color={C.ink} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Payment</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {[`${from} → ${to}`, dateLabel].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.secureIcon}>
          <Ionicons name="lock-closed" size={15} color={C.green} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Ticket */}
        <View style={styles.ticket}>
          <View style={styles.ticketTop}>
            <View style={styles.busIcon}>
              <Ionicons name="bus-outline" size={21} color={C.burgundy} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.busName} numberOfLines={1}>{busName}</Text>
              <Text style={styles.busType} numberOfLines={1}>
                {bus.bus_Type || bus.seat_Layout || 'Bus'}
              </Text>
            </View>
            {!!dateLabel && (
              <View style={styles.datePill}>
                <Text style={styles.dateText}>{dateLabel}</Text>
              </View>
            )}
          </View>

          <View style={styles.routeRow}>
            <View style={styles.routeStop}>
              <Text style={styles.routeTime}>{formatClock(String(bus.departure_Time || '')) || '--'}</Text>
              <Text style={styles.routeCity} numberOfLines={1}>{from}</Text>
            </View>

            <View style={styles.routeMiddle}>
              <View style={styles.routeDot} />
              <View style={styles.routeDash} />
              <Ionicons name="bus-outline" size={16} color={C.burgundy} />
              <View style={styles.routeDash} />
              <View style={styles.routeDot} />
            </View>

            <View style={[styles.routeStop, { alignItems: 'flex-end' }]}>
              <Text style={styles.routeTime}>{formatClock(String(bus.arrival_Time || '')) || '--'}</Text>
              <Text style={styles.routeCity} numberOfLines={1}>{to}</Text>
            </View>
          </View>

          <View style={styles.tear}>
            <View style={[styles.notch, { left: -10 }]} />
            <View style={styles.tearLine} />
            <View style={[styles.notch, { right: -10 }]} />
          </View>

          <View style={styles.ticketBottom}>
            <View style={styles.ticketCol}>
              <View style={styles.ticketLabelRow}>
                <Ionicons name="location-outline" size={14} color={C.burgundy} />
                <Text style={styles.metaLabel}>Boarding</Text>
              </View>
              <Text style={styles.metaValue} numberOfLines={2}>{boardingName}</Text>
              {!!boardingTime && <Text style={styles.metaTime}>{boardingTime}</Text>}
            </View>

            <View style={styles.ticketCol}>
              <View style={styles.ticketLabelRow}>
                <Ionicons name="flag-outline" size={14} color={C.burgundy} />
                <Text style={styles.metaLabel}>Dropping</Text>
              </View>
              <Text style={styles.metaValue} numberOfLines={2}>{droppingName}</Text>
              {!!droppingTime && <Text style={styles.metaTime}>{droppingTime}</Text>}
            </View>
          </View>

          {seatNames.length > 0 && (
            <View style={styles.seatsStrip}>
              <Text style={styles.metaLabel}>Seats</Text>
              <View style={styles.seatTags}>
                {seatNames.map(name => (
                  <View key={name} style={styles.seatTag}>
                    <Text style={styles.seatTagText}>{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Passengers */}
        <Text style={styles.sectionTitle}>Passengers</Text>
        <View style={styles.card}>
          {passengers.map((p, index) => (
            <View key={`${p.seat}-${index}`}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.passengerRow}>
                <View style={styles.seatChip}>
                  <Text style={styles.seatChipText} numberOfLines={1}>{p.seat}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.passengerName} numberOfLines={1}>
                    {[p.title, p.name].filter(Boolean).join(' ')}
                  </Text>
                  <Text style={styles.passengerMeta}>
                    {[p.gender, p.age ? `${p.age} years` : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Contact */}
        {(!!contact.mobile || !!contact.email) && (
          <>
            <Text style={styles.sectionTitle}>Contact</Text>
            <View style={styles.card}>
              {!!contact.mobile && (
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={17} color={C.muted} />
                  <Text style={styles.contactText}>+91 {contact.mobile}</Text>
                </View>
              )}
              {!!contact.mobile && !!contact.email && <View style={styles.divider} />}
              {!!contact.email && (
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={17} color={C.muted} />
                  <Text style={styles.contactText} numberOfLines={1}>{contact.email}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Fare breakdown */}
        <Text style={styles.sectionTitle}>Fare details</Text>
        <View style={styles.card}>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>
              Base fare · {selectedSeats.length || passengers.length} seat{(selectedSeats.length || passengers.length) === 1 ? '' : 's'}
            </Text>
            <Text style={styles.fareValue}>{formatAmount(breakdown.base)}</Text>
          </View>

          {breakdown.charges.map(line => (
            <View key={line.label} style={styles.fareRow}>
              <Text style={styles.fareLabel}>{line.label}</Text>
              <Text style={styles.fareValue}>{formatAmount(line.amount)}</Text>
            </View>
          ))}

          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Convenience fee</Text>
            <Text style={styles.freeText}>Free</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLabel}>Total payable</Text>
              <Text style={styles.totalSub}>Inclusive of all taxes</Text>
            </View>
            <Text style={styles.totalAmount}>{amountLabel}</Text>
          </View>
        </View>

        <View style={styles.secureNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={C.green} />
          <Text style={styles.secureText}>
            Secured by Razorpay. Your card and UPI details are never stored by StableBus.
          </Text>
        </View>

        {!!finalMessage && (
          <View style={styles.messageCard}>
            <Ionicons name="information-circle-outline" size={20} color={C.burgundy} />
            <Text style={styles.messageText}>{finalMessage}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: sheetBottom }]}>
        <View style={styles.bottomInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomLabel}>Amount to pay</Text>
            <Text style={styles.bottomAmount}>{amountLabel}</Text>
          </View>

          <Pressable
            onPress={handlePay}
            disabled={payBlocked}
            style={[styles.payButton, payBlocked && styles.payButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.payButtonText}>{finalMessage && !locked ? 'Try again' : 'Pay securely'}</Text>
                <Ionicons name="arrow-forward" size={17} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      </View>

      <BarLoader
        visible={loading && !!step && step !== 'Waiting for payment'}
        title={step}
        subtitle="Please keep the app open"
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
              <Ionicons name="information" size={14} color="#fff" />
            </View>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.paper,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  headerSubtitle: { fontSize: 13, color: C.muted, marginTop: 3 },
  secureIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EAF1EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 14,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },

  /* ticket (same look as the passenger screen) */
  ticket: {
    backgroundColor: C.paper,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#783D4A',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  busIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busName: { color: C.ink, fontSize: 15, fontWeight: '600' },
  busType: { color: C.muted, fontSize: 12, marginTop: 3 },
  datePill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { color: C.burgundy, fontSize: 12, fontWeight: '600' },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  routeStop: { flex: 1 },
  routeTime: { color: C.ink, fontSize: 18, fontWeight: '700' },
  routeCity: { color: C.muted, fontSize: 13, marginTop: 4 },
  routeMiddle: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  routeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.burgundy },
  routeDash: { flex: 1, height: 1, backgroundColor: C.border, marginHorizontal: 3 },
  tear: { height: 22, marginTop: 16, marginHorizontal: -16, justifyContent: 'center' },
  tearLine: {
    marginHorizontal: 16,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCCFC4',
  },
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
  ticketBottom: { flexDirection: 'row', gap: 14, marginTop: 6 },
  ticketCol: { flex: 1, minWidth: 0 },
  ticketLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaLabel: { color: C.muted, fontSize: 12 },
  metaValue: { color: C.ink, fontSize: 14, fontWeight: '600', marginTop: 5 },
  metaTime: { color: C.burgundy, fontSize: 13, marginTop: 3 },
  seatsStrip: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  seatTags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  seatTag: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatTagText: { color: C.burgundy, fontSize: 13, fontWeight: '600' },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: C.ink, marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: C.border },

  passengerRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  seatChip: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatChipText: { color: C.burgundy, fontSize: 14, fontWeight: '600' },
  passengerName: { fontSize: 15, fontWeight: '500', color: C.ink },
  passengerMeta: { fontSize: 13, color: C.muted, marginTop: 3 },

  contactRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactText: { flex: 1, color: C.ink, fontSize: 14 },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  fareLabel: { fontSize: 14, color: C.muted, flexShrink: 1, paddingRight: 12 },
  fareValue: { fontSize: 14, color: C.ink },
  freeText: { fontSize: 13, color: C.green, fontWeight: '500' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  totalLabel: { fontSize: 15, color: C.ink, fontWeight: '600' },
  totalSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  totalAmount: { fontSize: 20, color: C.burgundy, fontWeight: '700' },

  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 4 },
  secureText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 18 },

  messageCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.burgundyLight,
    padding: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  messageText: { flex: 1, color: C.ink, fontSize: 13, lineHeight: 19 },

  bottomBar: {
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loaderScreen: { flex: 1, backgroundColor: '#F8F4ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  loaderTitle: { color: '#382B28', fontSize: 20, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  loaderSubtitle: { color: '#887A73', fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  loaderTrack: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  loaderFill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },
  bottomInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomLabel: { color: C.muted, fontSize: 13 },
  bottomAmount: { color: C.ink, fontSize: 20, fontWeight: '700', marginTop: 3 },
  payButton: {
    minWidth: 160,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  payButtonDisabled: { backgroundColor: '#B9A6A8' },
  payButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

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