import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { request } from '@/services/http';
import { feedback } from '@/features/feedback/feedback';

/* Small round traveller picture for a passenger (picked from gender / title). */
const AVATAR_FEMALE = require('@/assets/scenic/avatar_female.png');
const AVATAR_MALE = require('@/assets/scenic/avatar_male.png');

function PassengerAvatar({ gender, title, size = 42 }: { gender?: string; title?: string; size?: number }) {
  const female =
    /^(f|female|woman|girl)/i.test(String(gender || '').trim()) ||
    /^(ms|mrs|miss)\.?$/i.test(String(title || '').trim());
  return (
    <Image
      source={female ? AVATAR_FEMALE : AVATAR_MALE}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FBEDE6' }}
    />
  );
}

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  placeholder: '#B5A8A0',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyDark: '#65313E',
  burgundyLight: '#F4EAEB',
  green: '#47765B',
  greenLight: '#EAF2EC',
  amber: '#9A6A22',
  amberLight: '#F8F0E1',
  red: '#B8453F',
  redLight: '#F9EAE8',
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
  status?: string;
};

const PHONE_RE = /(?:\+?91[\s-]*)?(?:\d[\s-]*){10,}/g;

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
  if (!value) return '';
  let date: Date;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else if (value.includes('/')) {
    const [m, d, y] = value.split('/');
    date = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatClock(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/am|pm/i.test(v)) return v.toUpperCase();
  const match = v.match(/(\d{1,2}):(\d{2})/);
  if (!match) return v;
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function formatMoney(value: string, currency = 'INR'): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return `${currency} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function pointName(point: any, type: 'boarding' | 'dropping', fallback: string): string {
  if (!point) return fallback;
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
  return clean || fallback;
}

function pointTime(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return '';
  return formatClock(String(point?.[`${type}_Time`] ?? point?.time ?? ''));
}

export default function Tickets() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const bus = useMemo(() => parseJson(params.bus) || {}, [params.bus]);
  const passengers = useMemo(
    () => (parseJson(params.passengers) || []) as Passenger[],
    [params.passengers]
  );
  const boarding = useMemo(() => parseJson(params.selectedBoardingPoint) || {}, [params.selectedBoardingPoint]);
  const dropping = useMemo(() => parseJson(params.selectedDroppingPoint) || {}, [params.selectedDroppingPoint]);

  const bookingId = firstParam(params, ['bookingId', 'booking_id']);
  const guestToken = firstParam(params, ['guestToken', 'guest_access_token']);
  const from = firstParam(params, ['from']);
  const to = firstParam(params, ['to']);
  const journeyDate = firstParam(params, ['date']);
  const amount = firstParam(params, ['totalFare', 'amount']);
  const currency = firstParam(params, ['currency']) || 'INR';
  // Set when this screen is showing a payment that did not end in a ticket (pending, failed, cancelled).
  const paymentId = firstParam(params, ['paymentId']);
  const gatewayOrderId = firstParam(params, ['gatewayOrderId']);
  const paymentMessage = firstParam(params, ['message']);

  const [bookingStatus, setBookingStatus] = useState(
    firstParam(params, ['bookingStatus', 'booking_status']).toUpperCase() || 'TICKETING_UNKNOWN'
  );
  const [pnr, setPnr] = useState(firstParam(params, ['transportPnr', 'transport_pnr']));
  const [supplierRef, setSupplierRef] = useState(firstParam(params, ['supplierRef', 'supplier_refno']));
  const [checking, setChecking] = useState(false);

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

  // The ticket is the end of checkout: Android hardware back goes Home.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/' as any);
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  // A soft pop and a double tap when the ticket is confirmed; one longer buzz when it is still
  // pending or failed. Plays once per status, so refreshing does not repeat it.
  const lastFeedback = useRef('');
  useEffect(() => {
    if (lastFeedback.current === bookingStatus) return;
    lastFeedback.current = bookingStatus;
    if (bookingStatus === 'CONFIRMED') feedback.success();
    else if (bookingStatus !== 'CANCELLED') feedback.attention();
  }, [bookingStatus]);

  const isConfirmed = bookingStatus === 'CONFIRMED';
  const isPaymentStage = bookingStatus.startsWith('PAYMENT_');
  const isPaymentPending = bookingStatus === 'PAYMENT_PENDING';
  const isPaymentCancelled = bookingStatus === 'PAYMENT_CANCELLED';
  const isFailed = ['BOOKING_FAILED', 'CANCELLED', 'PAYMENT_FAILED'].includes(bookingStatus);
  const tone = isConfirmed ? C.green : isFailed ? C.red : isPaymentCancelled ? C.burgundy : C.amber;
  const toneLight = isConfirmed
    ? C.greenLight
    : isFailed
      ? C.redLight
      : isPaymentCancelled
        ? C.burgundyLight
        : C.amberLight;

  const busName = bus.operator_Name || bus.travel_Name || 'Bus operator';
  const busType = bus.bus_Type || bus.seat_Layout || 'Bus service';
  const seats = passengers.map(p => p.seat).filter(Boolean) as string[];
  const boardingName = pointName(boarding, 'boarding', 'Boarding point');
  const droppingName = pointName(dropping, 'dropping', 'Dropping point');
  const boardingTime = pointTime(boarding, 'boarding');
  const droppingTime = pointTime(dropping, 'dropping');
  const dateLabel = formatDate(journeyDate);
  const paid = formatMoney(amount, currency);

  const statusTitle = isPaymentStage
    ? isPaymentPending
      ? 'Payment is being confirmed'
      : isPaymentCancelled
        ? 'Payment cancelled'
        : 'Payment did not go through'
    : isConfirmed
      ? 'Ticket confirmed'
      : isFailed
        ? 'Booking not confirmed'
        : 'Payment received';
  const statusText = isPaymentStage
    ? isPaymentPending
      ? paymentMessage ||
        'We are waiting for your bank. Please do not pay again. If the payment goes through, your ticket is issued automatically.'
      : isPaymentCancelled
        ? 'No money was taken. You can try again while your seats are held.'
        : 'If any money was deducted, your bank will return it automatically. You can try again.'
    : isConfirmed
      ? 'Have a safe and comfortable journey.'
      : isFailed
        ? 'Your ticket could not be confirmed. Please contact support before doing anything else.'
        : 'We are waiting for the bus operator to confirm your ticket. Please do not pay again.';

  // Pending payment: ask the server (and through it the bank) what has happened so far.
  async function checkPaymentStatus() {
    if (!bookingId || !paymentId || checking) return;
    setChecking(true);
    const headers = guestToken ? { 'X-Guest-Access-Token': guestToken } : undefined;
    try {
      const verified = await request<ApiResponse>(`/api/v1/bookings/${bookingId}/payments/verify`, {
        method: 'POST',
        timeoutMs: 90000,
        headers,
        body: JSON.stringify({ payment_id: paymentId, gateway_payment_id: gatewayOrderId, signature: '' }),
      });
      const paymentStatus = String(verified.status || '').toUpperCase();

      if (paymentStatus === 'SUCCESS') {
        let ticket: ApiResponse;
        try {
          ticket = await request<ApiResponse>(`/api/v1/bookings/${bookingId}/ticketing`, {
            method: 'POST',
            timeoutMs: 90000,
            headers,
          });
        } catch {
          // The server may already have started or finished the ticket by itself.
          ticket = await request<ApiResponse>(`/api/v1/bookings/${bookingId}/requery`, {
            method: 'POST',
            timeoutMs: 90000,
            headers,
          });
        }
        const next = String(ticket.booking_status || 'TICKETING_UNKNOWN').toUpperCase();
        setBookingStatus(next);
        if (ticket.transport_pnr) setPnr(ticket.transport_pnr);
        if (ticket.supplier_refno) setSupplierRef(ticket.supplier_refno);
        showToast(next === 'CONFIRMED' ? 'Your ticket is confirmed.' : 'Payment received. Confirming your ticket.');
      } else if (paymentStatus === 'FAILED') {
        setBookingStatus('PAYMENT_FAILED');
      } else {
        showToast('Your bank has not confirmed yet. Please do not pay again.');
      }
    } catch (error: any) {
      showToast(error?.message || 'Could not check the status. Please try again shortly.');
    } finally {
      setChecking(false);
    }
  }

  async function checkTicketStatus() {
    if (!bookingId || checking) return;
    setChecking(true);
    try {
      const response = await request<ApiResponse>(`/api/v1/bookings/${bookingId}/requery`, {
        method: 'POST',
        timeoutMs: 90000,
        headers: guestToken ? { 'X-Guest-Access-Token': guestToken } : undefined,
      });
      const nextStatus = String(response.booking_status || bookingStatus).toUpperCase();
      setBookingStatus(nextStatus);
      if (response.transport_pnr) setPnr(response.transport_pnr);
      if (response.supplier_refno) setSupplierRef(response.supplier_refno);
      if (nextStatus === 'CONFIRMED') {
        showToast('Your ticket is confirmed.');
      } else {
        showToast(response.message || 'Still waiting for the operator. Your payment is safe.');
      }
    } catch (error: any) {
      showToast(error?.message || 'Could not check the status. Please try again shortly.');
    } finally {
      setChecking(false);
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      // expo-clipboard is optional: if it is not installed the value is simply shown in the toast.
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(value);
      showToast(`${label} copied.`);
    } catch {
      showToast(`${label}: ${value}`);
    }
  }

  async function shareTicket() {
    const lines = [
      'StableBus ticket',
      `${from || '—'} → ${to || '—'}${dateLabel ? ` · ${dateLabel}` : ''}`,
      `Bus: ${busName}`,
      boardingTime ? `Boarding: ${boardingName}, ${boardingTime}` : `Boarding: ${boardingName}`,
      droppingTime ? `Dropping: ${droppingName}, ${droppingTime}` : `Dropping: ${droppingName}`,
      `Seats: ${seats.join(', ') || '—'}`,
      `Booking ID: ${bookingId || '—'}`,
      `PNR: ${pnr || 'Pending'}`,
      `Status: ${bookingStatus.split('_').join(' ')}`,
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      showToast('Could not open sharing.');
    }
  }

  const goHome = () => router.replace('/' as any);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.paper} />

      <View style={[styles.header, { paddingTop: 10 + insets.top }]}>
        <Pressable onPress={goHome} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Go to Home">
          <Ionicons name="home-outline" size={20} color={C.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isPaymentStage ? 'Your booking' : 'Your ticket'}</Text>
          <Text style={styles.headerSubtitle}>StableBus booking</Text>
        </View>
        {isPaymentStage ? (
          <View style={styles.iconButton} />
        ) : (
          <Pressable onPress={shareTicket} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Share ticket">
            <Ionicons name="share-social-outline" size={20} color={C.burgundy} />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: toneLight }]}>
            <Ionicons
              name={isConfirmed ? 'checkmark' : isFailed ? 'close' : isPaymentCancelled ? 'remove' : 'time-outline'}
              size={30}
              color={tone}
            />
          </View>
          <Text style={styles.heroTitle}>{statusTitle}</Text>
          <Text style={styles.heroText}>{statusText}</Text>
          <View style={[styles.statusPill, { backgroundColor: toneLight }]}>
            <View style={[styles.statusDot, { backgroundColor: tone }]} />
            <Text style={[styles.statusLabel, { color: tone }]}>{bookingStatus.split('_').join(' ')}</Text>
          </View>
        </View>

        {/* Ticket (same look as the Passengers and Payments screens) */}
        <View style={styles.ticket}>
          <View style={styles.ticketTop}>
            <View style={styles.busIcon}>
              <Ionicons name="bus-outline" size={21} color={C.burgundy} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.busName} numberOfLines={1}>{busName}</Text>
              <Text style={styles.busType} numberOfLines={1}>{busType}</Text>
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
              <Text style={styles.routeCity} numberOfLines={1}>{from || 'Origin'}</Text>
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
              <Text style={styles.routeCity} numberOfLines={1}>{to || 'Destination'}</Text>
            </View>
          </View>

          <View style={styles.tear}>
            <View style={[styles.notch, { left: -10 }]} />
            <View style={styles.tearLine} />
            <View style={[styles.notch, { right: -10 }]} />
          </View>

          <View style={styles.ticketBottom}>
            <View style={styles.ticketCol}>
              <View style={styles.labelRow}>
                <Ionicons name="location-outline" size={14} color={C.burgundy} />
                <Text style={styles.metaLabel}>Boarding</Text>
              </View>
              <Text style={styles.metaValue} numberOfLines={2}>{boardingName}</Text>
              {!!boardingTime && <Text style={styles.metaTime}>{boardingTime}</Text>}
            </View>
            <View style={styles.ticketCol}>
              <View style={styles.labelRow}>
                <Ionicons name="flag-outline" size={14} color={C.burgundy} />
                <Text style={styles.metaLabel}>Dropping</Text>
              </View>
              <Text style={styles.metaValue} numberOfLines={2}>{droppingName}</Text>
              {!!droppingTime && <Text style={styles.metaTime}>{droppingTime}</Text>}
            </View>
          </View>

          {seats.length > 0 && (
            <View style={styles.seatsStrip}>
              <Text style={styles.metaLabel}>Seats</Text>
              <View style={styles.seatTags}>
                {seats.map(name => (
                  <View key={name} style={styles.seatTag}>
                    <Text style={styles.seatTagText}>{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* References */}
        <View style={styles.card}>
          <ReferenceRow
            label="Booking ID"
            value={bookingId || '—'}
            onCopy={bookingId ? () => copyValue(bookingId, 'Booking ID') : undefined}
          />
          {!isPaymentStage && (
            <>
              <View style={styles.divider} />
              <ReferenceRow
                label="Operator PNR"
                value={pnr || 'Pending'}
                strong
                muted={!pnr}
                onCopy={pnr ? () => copyValue(pnr, 'PNR') : undefined}
              />
              {!!supplierRef && (
                <>
                  <View style={styles.divider} />
                  <ReferenceRow
                    label="Operator reference"
                    value={supplierRef}
                    onCopy={() => copyValue(supplierRef, 'Reference')}
                  />
                </>
              )}
            </>
          )}
          {!!paid && (
            <>
              <View style={styles.divider} />
              <View style={styles.refRow}>
                <Text style={styles.refLabel}>{isPaymentStage ? 'Amount' : 'Total paid'}</Text>
                <Text style={styles.paid}>{paid}</Text>
              </View>
            </>
          )}
        </View>

        {/* Passengers */}
        <Text style={styles.sectionTitle}>Passengers</Text>
        <View style={styles.card}>
          {passengers.map((p, index) => (
            <View key={`${p.seat || 'seat'}-${index}`}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.passengerRow}>
                <PassengerAvatar gender={p.gender} title={p.title} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.passengerName} numberOfLines={1}>
                    {[p.title, p.name].filter(Boolean).join(' ') || `Passenger ${index + 1}`}
                  </Text>
                  <Text style={styles.passengerMeta} numberOfLines={1}>
                    {[p.age ? `${p.age} yrs` : '', p.gender || ''].filter(Boolean).join(' · ') || 'Passenger'}
                    {p.ticket_number ? `  ·  Ticket ${p.ticket_number}` : ''}
                  </Text>
                </View>
                <View style={styles.seatChip}>
                  <Text style={styles.seatChipText}>{p.seat || '—'}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {isConfirmed && (
          <View style={styles.note}>
            <Ionicons name="mail-outline" size={18} color={C.burgundy} />
            <Text style={styles.noteText}>
              A confirmation email has been sent to you. Arrive ahead of boarding time and carry a valid photo ID.
            </Text>
          </View>
        )}

        {isPaymentPending && (
          <View style={[styles.note, { backgroundColor: C.amberLight }]}>
            <Ionicons name="information-circle-outline" size={19} color={C.amber} />
            <Text style={[styles.noteText, { color: '#76551F' }]}>
              Please do not pay again. We check with your bank automatically and issue your ticket as soon as the payment
              goes through. You will get a notification.
            </Text>
          </View>
        )}

        {!isConfirmed && !isFailed && !isPaymentStage && (
          <View style={[styles.note, { backgroundColor: C.amberLight }]}>
            <Ionicons name="information-circle-outline" size={19} color={C.amber} />
            <Text style={[styles.noteText, { color: '#76551F' }]}>
              Ticket confirmation can take a little longer than payment. Tap “Check ticket status” in a minute.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {isPaymentPending && !!paymentId && (
            <Pressable
              style={[styles.primaryButton, checking && { opacity: 0.8 }]}
              onPress={checkPaymentStatus}
              disabled={checking}
            >
              {checking ? <ActivityIndicator color="#fff" /> : <Ionicons name="refresh" size={18} color="#fff" />}
              <Text style={styles.primaryText}>{checking ? 'Checking status…' : 'Check payment status'}</Text>
            </Pressable>
          )}
          {(bookingStatus === 'PAYMENT_FAILED' || isPaymentCancelled) && router.canGoBack() && (
            <Pressable style={styles.primaryButton} onPress={() => router.back()}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          )}
          {!isConfirmed && !isFailed && !isPaymentStage && (
            <Pressable
              style={[styles.primaryButton, checking && { opacity: 0.8 }]}
              onPress={checkTicketStatus}
              disabled={checking}
            >
              {checking ? <ActivityIndicator color="#fff" /> : <Ionicons name="refresh" size={18} color="#fff" />}
              <Text style={styles.primaryText}>{checking ? 'Checking status…' : 'Check ticket status'}</Text>
            </Pressable>
          )}
          <Pressable style={isConfirmed ? styles.primaryButton : styles.secondaryButton} onPress={goHome}>
            <Text style={isConfirmed ? styles.primaryText : styles.secondaryText}>Done</Text>
            <Ionicons name="arrow-forward" size={17} color={isConfirmed ? '#fff' : C.burgundy} />
          </Pressable>
        </View>
      </ScrollView>

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

function ReferenceRow({
  label,
  value,
  onCopy,
  strong,
  muted,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.refRow}>
      <Text style={styles.refLabel}>{label}</Text>
      <View style={styles.refValueWrap}>
        <Text
          style={[styles.refValue, strong && styles.refStrong, muted && { color: C.placeholder, fontWeight: '500' }]}
          numberOfLines={1}
          selectable
        >
          {value}
        </Text>
        {!!onCopy && (
          <Pressable onPress={onCopy} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
            <Ionicons name="copy-outline" size={17} color={C.burgundy} />
          </Pressable>
        )}
      </View>
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  headerSubtitle: { fontSize: 13, color: C.muted, marginTop: 3 },
  content: { padding: 14, width: '100%', maxWidth: 680, alignSelf: 'center' },

  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 20, paddingHorizontal: 12 },
  heroIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: C.ink, fontSize: 21, fontWeight: '700', marginTop: 14 },
  heroText: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6, maxWidth: 320 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 30,
    marginTop: 14,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },

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
  ticketBottom: { flexDirection: 'row', gap: 14, marginTop: 6 },
  ticketCol: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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

  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 14,
  },
  divider: { height: 1, backgroundColor: C.border },
  refRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  refLabel: { color: C.muted, fontSize: 13 },
  refValueWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
  refValue: { flexShrink: 1, color: C.ink, fontSize: 13, fontWeight: '500', textAlign: 'right' },
  refStrong: { color: C.burgundy, fontSize: 16, fontWeight: '700' },
  paid: { color: C.burgundy, fontSize: 16, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: C.ink, marginTop: 22, marginBottom: -4, paddingHorizontal: 2 },
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

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.burgundyLight,
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
  },
  noteText: { flex: 1, color: C.burgundyDark, fontSize: 13, lineHeight: 19 },

  actions: { gap: 10, marginTop: 22 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  secondaryText: { color: C.burgundy, fontSize: 15, fontWeight: '600' },

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