
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function getApiError(error: any): string {
  return error?.message || 'Something went wrong. Please try again.';
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

  async function initiatePayment(
    id: string,
    guestAccessToken: string
  ): Promise<ApiResponse> {
    setStep('Preparing secure payment');

    const result = await request<ApiResponse>(
      `/api/v1/bookings/${id}/payments`,
      {
        method: 'POST',
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
      { method: 'POST', headers }
    );

    return request<ApiResponse>(
      `/api/v1/bookings/${id}/requery`,
      { method: 'POST', headers }
    );
  }

  async function handlePay() {
    if (loading) return;

    if (Platform.OS === 'web') {
      Alert.alert(
        'Open the mobile app',
        'Razorpay native checkout must be tested in the Android or iOS app.'
      );
      return;
    }

    const razorpayKey = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

    if (!razorpayKey) {
      Alert.alert(
        'Payment configuration missing',
        'Add EXPO_PUBLIC_RAZORPAY_KEY_ID to your mobile app environment.'
      );
      return;
    }

    if (!fare || fare <= 0) {
      Alert.alert('Invalid fare', 'The booking amount is not valid.');
      return;
    }

    setLoading(true);
    setFinalMessage('');

    try {
      // Step 1: Create the temporary bus booking.
      let created: ApiResponse;

      if (bookingId) {
        created = { booking_id: bookingId, guest_access_token: guestToken };
      } else {
        created = await createBooking();
      }

      const id = created.booking_id!;
      const token = created.guest_access_token || guestToken;

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
      setStep('Waiting for payment');

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

      const checkout = await razorpayModule.open({
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

      const razorpayPaymentId = checkout.razorpay_payment_id;
      const signature = checkout.razorpay_signature;

      if (!razorpayPaymentId || !signature) {
        throw new Error('Razorpay did not return payment verification details.');
      }

      // Step 4: Backend verifies signature and captured amount.
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
        return;
      }

      // Step 5: Ask the bus provider to issue the ticket, then open
      // the ticket screen for both confirmed and still-pending outcomes.
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
      const message = getApiError(error);

      // Razorpay cancellation is not a server payment failure.
      if (
        String(message).toLowerCase().includes('cancel') ||
        error?.code === 'PAYMENT_CANCELLED'
      ) {
        setFinalMessage('Payment was cancelled. Your booking has not been confirmed.');
      } else {
        setFinalMessage(message);
      }
    } finally {
      setLoading(false);
      setStep('');
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          disabled={loading}
        >
          <Ionicons name="arrow-back" size={21} color={C.ink} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Payment</Text>
          <Text style={styles.headerSubtitle}>Review and complete your booking</Text>
        </View>

        <View style={styles.secureIcon}>
          <Ionicons name="lock-closed" size={16} color={C.green} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          <View style={styles.progressDone}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </View>
          <View style={styles.progressLine} />
          <View style={styles.progressActive}>
            <Text style={styles.progressActiveText}>2</Text>
          </View>
          <View style={styles.progressLineMuted} />
          <View style={styles.progressPending}>
            <Text style={styles.progressPendingText}>3</Text>
          </View>
        </View>

        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>Passengers</Text>
          <Text style={[styles.progressLabel, { color: C.burgundy }]}>Payment</Text>
          <Text style={styles.progressLabel}>Ticket</Text>
        </View>

        <View style={styles.tripCard}>
          <View style={styles.tripTop}>
            <View style={styles.busIcon}>
              <Ionicons name="bus-outline" size={21} color={C.burgundy} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.busName}>{busName}</Text>
              <Text style={styles.busType}>
                {bus.bus_Type || bus.seat_Layout || 'Bus'}
              </Text>
            </View>
            <View style={styles.datePill}>
              <Text style={styles.dateText}>{journeyDate}</Text>
            </View>
          </View>

          <View style={styles.routeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.city}>{from}</Text>
              <Text style={styles.pointName} numberOfLines={2}>
                {boarding.boarding_Name || boarding.point_Name || 'Boarding point'}
              </Text>
            </View>

            <View style={styles.routeMiddle}>
              <View style={styles.routeDot} />
              <View style={styles.routeDash} />
              <Ionicons name="bus-outline" size={17} color={C.burgundy} />
              <View style={styles.routeDash} />
              <View style={styles.routeDot} />
            </View>

            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.city}>{to}</Text>
              <Text style={[styles.pointName, { textAlign: 'right' }]} numberOfLines={2}>
                {dropping.dropping_Name || dropping.point_Name || 'Dropping point'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passenger details</Text>
          <View style={styles.whiteCard}>
            {passengers.map((p, index) => (
              <View
                key={`${p.seat}-${index}`}
                style={[
                  styles.passengerRow,
                  index < passengers.length - 1 && styles.passengerDivider,
                ]}
              >
                <View style={styles.passengerAvatar}>
                  <Ionicons name="person-outline" size={17} color={C.burgundy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passengerName}>
                    {[p.title, p.name].filter(Boolean).join(' ')}
                  </Text>
                  <Text style={styles.passengerMeta}>
                    {p.gender} · {p.age} years
                  </Text>
                </View>
                <View style={styles.seatPill}>
                  <Text style={styles.seatText}>{p.seat}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fare summary</Text>
          <View style={styles.whiteCard}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Seats ({selectedSeats.length})</Text>
              <Text style={styles.fareValue}>{amountLabel}</Text>
            </View>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Convenience fee</Text>
              <Text style={styles.freeText}>FREE</Text>
            </View>

            <View style={styles.fareDivider} />

            <View style={styles.totalRow}>
              <View>
                <Text style={styles.totalLabel}>Total payable</Text>
                <Text style={styles.totalSub}>Inclusive of applicable charges</Text>
              </View>
              <Text style={styles.totalAmount}>{amountLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.securityCard}>
          <View style={styles.securityIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={C.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Secure payment</Text>
            <Text style={styles.securityText}>
              Payments are processed securely by Razorpay. Your card and UPI details are never stored by StableBus.
            </Text>
          </View>
        </View>

        {!!finalMessage && (
          <View style={styles.messageCard}>
            <Ionicons
              name={
                finalMessage.toLowerCase().includes('confirmed')
                  ? 'checkmark-circle-outline'
                  : 'information-circle-outline'
              }
              size={22}
              color={C.burgundy}
            />
            <Text style={styles.messageText}>{finalMessage}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        {!!step && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={C.burgundy} />
            <Text style={styles.processingText}>{step}...</Text>
          </View>
        )}

        <View style={styles.bottomInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomLabel}>Amount to pay</Text>
            <Text style={styles.bottomAmount}>{amountLabel}</Text>
          </View>

          <Pressable
            onPress={handlePay}
            disabled={loading || !!finalMessage}
            style={[
              styles.payButton,
              (loading || !!finalMessage) && styles.payButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.payButtonText}>Pay securely</Text>
                <Ionicons name="arrow-forward" size={17} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 13,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  headerSubtitle: { fontSize: 12, color: C.muted, marginTop: 3 },
  secureIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EAF1EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 18,
    paddingBottom: 30,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  progressDone: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressActive: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressActiveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  progressPending: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#EAE3DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPendingText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  progressLine: { width: 55, height: 2, backgroundColor: C.green },
  progressLineMuted: { width: 55, height: 2, backgroundColor: C.border },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 22,
  },
  progressLabel: { fontSize: 11, color: C.muted },
  tripCard: {
    backgroundColor: C.paper,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  tripTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  busIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busName: { color: C.ink, fontSize: 14, fontWeight: '700' },
  busType: { color: C.muted, fontSize: 11, marginTop: 3 },
  datePill: {
    backgroundColor: C.burgundyLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  dateText: { color: C.burgundy, fontSize: 11, fontWeight: '700' },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 23,
    gap: 9,
  },
  city: { fontSize: 15, fontWeight: '700', color: C.ink },
  pointName: { color: C.muted, fontSize: 10, marginTop: 5, lineHeight: 15 },
  routeMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.burgundy },
  routeDash: {
    height: 1,
    flex: 1,
    maxWidth: 30,
    backgroundColor: '#D9C8C3',
  },
  section: { marginTop: 23 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 11,
  },
  whiteCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 17,
    paddingHorizontal: 15,
  },
  passengerRow: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  passengerDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  passengerAvatar: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerName: { fontSize: 13, fontWeight: '600', color: C.ink },
  passengerMeta: { fontSize: 11, color: C.muted, marginTop: 4 },
  seatPill: {
    backgroundColor: '#F1EEE8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  seatText: { color: C.ink, fontSize: 11, fontWeight: '700' },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  fareLabel: { fontSize: 13, color: C.muted },
  fareValue: { fontSize: 13, fontWeight: '600', color: C.ink },
  freeText: { fontSize: 12, color: C.green, fontWeight: '700' },
  fareDivider: { height: 1, backgroundColor: C.border },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  totalLabel: { fontSize: 14, color: C.ink, fontWeight: '700' },
  totalSub: { fontSize: 10, color: C.muted, marginTop: 4 },
  totalAmount: { fontSize: 19, color: C.burgundy, fontWeight: '800' },
  securityCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#EEF2EB',
    borderRadius: 15,
    padding: 14,
    marginTop: 20,
  },
  securityIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#DDE9DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTitle: { color: '#355D43', fontSize: 12, fontWeight: '700' },
  securityText: {
    color: '#607565',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  messageCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.burgundyLight,
    padding: 14,
    borderRadius: 14,
    marginTop: 18,
  },
  messageText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 18 },
  bottomBar: {
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 25 : 14,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  processingText: { fontSize: 11, color: C.muted },
  bottomInner: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomLabel: { color: C.muted, fontSize: 11 },
  bottomAmount: { color: C.ink, fontSize: 20, fontWeight: '800', marginTop: 3 },
  payButton: {
    minWidth: 160,
    height: 51,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  payButtonDisabled: { backgroundColor: '#B9A6A8' },
  payButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
