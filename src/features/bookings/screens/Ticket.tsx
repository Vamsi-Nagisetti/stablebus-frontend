import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  greenLight: '#EAF2EC',
  amber: '#9A6A22',
  amberLight: '#F8F0E1',
  red: '#B8453F',
};

type Passenger = {
  title?: string;
  name?: string;
  age?: number | string;
  gender?: string;
  seat?: string;
  ticket_number?: string;
};

type ApiResponse = {
  booking_id?: string;
  booking_status?: string;
  supplier_refno?: string | null;
  transport_pnr?: string | null;
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

function formatDate(value: string): string {
  if (!value) return 'Date not available';
  let date: Date;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatMoney(value: string, currency = 'INR'): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return `${currency} ${value || '—'}`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
}

function pointName(point: any, fallback: string): string {
  return String(
    point?.boarding_Name || point?.dropping_Name || point?.point_Name ||
    point?.boardingName || point?.droppingName || point?.pointName ||
    point?.name || fallback
  );
}

export default function Tickets() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const bus = useMemo(() => parseJson(params.bus) || {}, [params.bus]);
  const passengers = useMemo(
    () => (parseJson(params.passengers) || []) as Passenger[],
    [params.passengers]
  );
  const boarding = useMemo(
    () => parseJson(params.selectedBoardingPoint) || {},
    [params.selectedBoardingPoint]
  );
  const dropping = useMemo(
    () => parseJson(params.selectedDroppingPoint) || {},
    [params.selectedDroppingPoint]
  );

  const bookingId = firstParam(params, ['bookingId', 'booking_id']);
  const guestToken = firstParam(params, ['guestToken', 'guest_access_token']);
  const from = firstParam(params, ['from']);
  const to = firstParam(params, ['to']);
  const journeyDate = firstParam(params, ['date']);
  const amount = firstParam(params, ['totalFare', 'amount']);
  const currency = firstParam(params, ['currency']) || 'INR';
  const [bookingStatus, setBookingStatus] = useState(
    firstParam(params, ['bookingStatus', 'booking_status']).toUpperCase() || 'TICKETING_UNKNOWN'
  );
  const [pnr, setPnr] = useState(firstParam(params, ['transportPnr', 'transport_pnr']));
  const [supplierRef, setSupplierRef] = useState(
    firstParam(params, ['supplierRef', 'supplier_refno'])
  );
  const [checking, setChecking] = useState(false);

  // Ticket is the end of checkout: Android hardware back also goes Home.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/' as any);
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  const isConfirmed = bookingStatus === 'CONFIRMED';
  const isFailed = ['BOOKING_FAILED', 'CANCELLED'].includes(bookingStatus);
  const busName = bus.operator_Name || bus.travel_Name || 'Bus operator';
  const busType = bus.bus_Type || bus.seat_Layout || 'Bus service';
  const seats = passengers.map(p => p.seat).filter(Boolean);
  const boardingName = pointName(boarding, 'Boarding point');
  const droppingName = pointName(dropping, 'Dropping point');

  async function checkTicketStatus() {
    if (!bookingId || checking) return;
    setChecking(true);
    try {
      const response = await request<ApiResponse>(
        `/api/v1/bookings/${bookingId}/requery`,
        {
          method: 'POST',
          headers: guestToken
            ? { 'X-Guest-Access-Token': guestToken }
            : undefined,
        }
      );
      const nextStatus = String(response.booking_status || bookingStatus).toUpperCase();
      setBookingStatus(nextStatus);
      if (response.transport_pnr) setPnr(response.transport_pnr);
      if (response.supplier_refno) setSupplierRef(response.supplier_refno);
      if (nextStatus !== 'CONFIRMED') {
        Alert.alert(
          'Confirmation is still pending',
          response.message || 'Your payment is safe. The bus operator has not confirmed the ticket yet.'
        );
      }
    } catch (error: any) {
      Alert.alert('Unable to check status', error?.message || 'Please try again shortly.');
    } finally {
      setChecking(false);
    }
  }

  function copyValue(value: string, label: string) {
    // Clipboard integration is intentionally not assumed; display the value for manual copying.
    Alert.alert(label, value);
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/' as any)}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
        >
          <Ionicons name="home-outline" size={20} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Your ticket</Text>
          <Text style={styles.headerSubtitle}>StableBus booking details</Text>
        </View>
        <Ionicons name="bus-outline" size={23} color={C.burgundy} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.successArea}>
          <View style={[styles.successIcon, !isConfirmed && styles.pendingIcon, isFailed && styles.failedIcon]}>
            <Ionicons
              name={isConfirmed ? 'checkmark' : isFailed ? 'close' : 'time-outline'}
              size={35}
              color={isConfirmed ? C.green : isFailed ? C.red : C.amber}
            />
          </View>
          <Text style={styles.successTitle}>
            {isConfirmed ? 'Booking Confirmed!' : isFailed ? 'Booking not confirmed' : 'Payment Successful'}
          </Text>
          <Text style={styles.successSubtitle}>
            {isConfirmed
              ? 'Your bus ticket has been confirmed. Have a safe journey!'
              : isFailed
                ? 'Your ticket could not be confirmed. Please contact support before taking any further action.'
                : 'Your payment is verified. We are waiting for the bus operator to confirm your ticket.'}
          </Text>
          <View style={[styles.statusPill, isConfirmed ? styles.confirmedPill : isFailed ? styles.failedPill : styles.pendingPill]}>
            <View style={[styles.statusDot, { backgroundColor: isConfirmed ? C.green : isFailed ? C.red : C.amber }]} />
            <Text style={[styles.statusText, { color: isConfirmed ? C.green : isFailed ? C.red : C.amber }]}>
              {bookingStatus.replaceAll('_', ' ')}
            </Text>
          </View>
        </View>

        <View style={styles.referenceCard}>
          <View style={styles.referenceItem}>
            <Text style={styles.referenceLabel}>BOOKING ID</Text>
            <View style={styles.referenceValueRow}>
              <Text style={styles.referenceValue} numberOfLines={1}>{bookingId || '—'}</Text>
              {!!bookingId && <Pressable onPress={() => copyValue(bookingId, 'Booking ID')}><Ionicons name="copy-outline" size={17} color={C.burgundy} /></Pressable>}
            </View>
          </View>
          <View style={styles.referenceDivider} />
          <View style={styles.referenceItem}>
            <Text style={styles.referenceLabel}>PNR</Text>
            <View style={styles.referenceValueRow}>
              <Text style={styles.pnrValue}>{pnr || 'Pending'}</Text>
              {!!pnr && <Pressable onPress={() => copyValue(pnr, 'PNR')}><Ionicons name="copy-outline" size={17} color={C.burgundy} /></Pressable>}
            </View>
          </View>
        </View>

        <View style={styles.ticketCard}>
          <View style={styles.ticketTop}>
            <View style={styles.busIcon}><Ionicons name="bus" size={21} color={C.burgundy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.operatorName}>{busName}</Text>
              <Text style={styles.operatorType}>{busType}</Text>
            </View>
            <Text style={styles.fare}>{formatMoney(amount, currency)}</Text>
          </View>

          <View style={styles.ticketDivider} />

          <View style={styles.routeRow}>
            <View style={styles.routeCity}>
              <Text style={styles.cityLabel}>FROM</Text>
              <Text style={styles.cityName}>{from || 'Origin'}</Text>
            </View>
            <View style={styles.routeMiddle}>
              <View style={styles.routeLine} />
              <Ionicons name="bus-outline" size={19} color={C.burgundy} />
              <View style={styles.routeLine} />
            </View>
            <View style={[styles.routeCity, { alignItems: 'flex-end' }]}>
              <Text style={styles.cityLabel}>TO</Text>
              <Text style={styles.cityName}>{to || 'Destination'}</Text>
            </View>
          </View>
          <Text style={styles.journeyDate}>{formatDate(journeyDate)}</Text>

          <View style={styles.ticketDivider} />

          <View style={styles.pointRow}>
            <View style={styles.pointIcon}><Ionicons name="location-outline" size={17} color={C.burgundy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointLabel}>BOARDING POINT</Text>
              <Text style={styles.pointValue}>{boardingName}</Text>
            </View>
          </View>
          <View style={styles.pointRow}>
            <View style={styles.pointIcon}><Ionicons name="flag-outline" size={17} color={C.burgundy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointLabel}>DROPPING POINT</Text>
              <Text style={styles.pointValue}>{droppingName}</Text>
            </View>
          </View>

          <View style={styles.ticketDivider} />

          <View style={styles.seatFareRow}>
            <View>
              <Text style={styles.pointLabel}>SEATS</Text>
              <Text style={styles.pointValue}>{seats.length ? seats.join(', ') : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.pointLabel}>PASSENGERS</Text>
              <Text style={styles.pointValue}>{passengers.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.passengerSection}>
          <Text style={styles.sectionTitle}>Passenger details</Text>
          {passengers.map((passenger, index) => (
            <View key={`${passenger.seat || 'seat'}-${index}`} style={styles.passengerCard}>
              <View style={styles.passengerAvatar}><Ionicons name="person-outline" size={17} color={C.burgundy} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.passengerName}>{[passenger.title, passenger.name].filter(Boolean).join(' ') || `Passenger ${index + 1}`}</Text>
                <Text style={styles.passengerMeta}>
                  {passenger.ticket_number ? `Ticket: ${passenger.ticket_number}` : `${passenger.age ? `${passenger.age} years` : 'Passenger'} · ${passenger.gender || ''}`}
                </Text>
              </View>
              <View style={styles.seatBadge}><Text style={styles.seatBadgeText}>{passenger.seat || '—'}</Text></View>
            </View>
          ))}
        </View>

        {!!supplierRef && (
          <View style={styles.supplierCard}>
            <Text style={styles.referenceLabel}>SUPPLIER REFERENCE</Text>
            <Text style={styles.supplierValue}>{supplierRef}</Text>
          </View>
        )}

        {!isConfirmed && !isFailed && (
          <View style={styles.pendingNotice}>
            <Ionicons name="information-circle-outline" size={20} color={C.amber} />
            <Text style={styles.pendingNoticeText}>
              Please don't make another payment. Ticket confirmation is separate from payment verification.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {!isConfirmed && !isFailed && (
            <Pressable style={styles.checkButton} onPress={checkTicketStatus} disabled={checking}>
              {checking ? <ActivityIndicator color="#fff" /> : <Ionicons name="refresh" size={18} color="#fff" />}
              <Text style={styles.checkButtonText}>{checking ? 'Checking status…' : 'Check ticket status'}</Text>
            </Pressable>
          )}
          <Pressable style={styles.doneButton} onPress={() => router.replace('/' as any)}>
            <Text style={styles.doneButtonText}>Done</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.border, gap: 13 },
  backButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  headerSubtitle: { fontSize: 12, color: C.muted, marginTop: 3 },
  content: { padding: 18, paddingBottom: 35, width: '100%', maxWidth: 680, alignSelf: 'center' },
  successArea: { alignItems: 'center', paddingTop: 20, paddingBottom: 22 },
  successIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pendingIcon: { backgroundColor: C.amberLight },
  failedIcon: { backgroundColor: '#F9EAE8' },
  successTitle: { color: C.ink, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  successSubtitle: { color: C.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7, maxWidth: 310 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginTop: 13 },
  confirmedPill: { backgroundColor: C.greenLight },
  pendingPill: { backgroundColor: C.amberLight },
  failedPill: { backgroundColor: '#F9EAE8' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  referenceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.burgundyLight, borderRadius: 17, padding: 15, marginBottom: 15 },
  referenceItem: { flex: 1, minWidth: 0 },
  referenceDivider: { width: 1, height: 39, backgroundColor: '#DFCBCF', marginHorizontal: 13 },
  referenceLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  referenceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  referenceValue: { color: C.ink, fontSize: 11, fontWeight: '700', flex: 1 },
  pnrValue: { color: C.burgundy, fontSize: 16, fontWeight: '800', flex: 1 },
  ticketCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 16 },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  busIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.burgundyLight, alignItems: 'center', justifyContent: 'center' },
  operatorName: { color: C.ink, fontSize: 13, fontWeight: '800' },
  operatorType: { color: C.muted, fontSize: 10, marginTop: 4 },
  fare: { color: C.burgundy, fontSize: 14, fontWeight: '800' },
  ticketDivider: { height: 1, backgroundColor: C.border, marginVertical: 16 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeCity: { flex: 1 },
  cityLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  cityName: { color: C.ink, fontSize: 15, fontWeight: '800', marginTop: 5 },
  routeMiddle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  routeLine: { flex: 1, height: 1, backgroundColor: '#D8C7C2' },
  journeyDate: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 12 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  pointIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.burgundyLight, alignItems: 'center', justifyContent: 'center' },
  pointLabel: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  pointValue: { color: C.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
  seatFareRow: { flexDirection: 'row', justifyContent: 'space-between' },
  passengerSection: { marginTop: 22 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  passengerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  passengerAvatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.burgundyLight, alignItems: 'center', justifyContent: 'center' },
  passengerName: { color: C.ink, fontSize: 12, fontWeight: '700' },
  passengerMeta: { color: C.muted, fontSize: 10, marginTop: 4 },
  seatBadge: { backgroundColor: '#F1EEE8', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  seatBadgeText: { color: C.ink, fontSize: 11, fontWeight: '800' },
  supplierCard: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginTop: 10 },
  supplierValue: { color: C.ink, fontSize: 13, fontWeight: '700', marginTop: 6 },
  pendingNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: C.amberLight, borderRadius: 13, padding: 13, marginTop: 17 },
  pendingNoticeText: { flex: 1, color: '#76551F', fontSize: 11, lineHeight: 17 },
  actions: { gap: 10, marginTop: 22 },
  checkButton: { minHeight: 49, borderRadius: 14, backgroundColor: C.burgundy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  checkButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  doneButton: { minHeight: 49, borderRadius: 14, backgroundColor: C.burgundyDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  doneButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
