import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendOTP, verifyOTP } from '@/features/auth/api';
import { saveTokens, getTokens, clearTokens } from '@/features/auth/tokenStorage';
import { request } from '@/services/http';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  placeholder: '#B0A49C',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
  green: '#47765B',
  rose: '#A65372',
  error: '#B8453F',
};

type Passenger = {
  title?: string;
  dob?: string; // API format YYYY-MM-DD
  name: string;
  age: string;
  gender: string;
  passengerId?: string;
  seatIndex: number;
};

type SavedPassenger = {
  passenger_id: string;
  name: string;
  age: number | string;
  gender: string;
  title?: string;
  date_of_birth?: string;
};

/* =====================================================
   Helpers
===================================================== */

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asArray(value: unknown): any[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function str(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function formatFare(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function getSeatName(seat: any, index: number): string {
  return String(
    seat?.seat_Number ?? seat?.seat_Name ?? seat?.seatNo ?? seat?.seat_Key ?? `Seat ${index + 1}`
  );
}

function getPointName(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return 'Not selected';
  const raw = String(
    point?.[`${type}_Name`] ??
      point?.[`${type}Name`] ??
      point?.point_Name ??
      point?.pointName ??
      point?.name ??
      'Selected point'
  );
  return raw.split('^')[0].replace(/\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim() || 'Selected point';
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

function getPointTime(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return '';
  const value = String(point?.[`${type}_Time`] ?? point?.time ?? '').trim();
  if (!value) return '';
  if (/am|pm/i.test(value)) return value.toUpperCase();
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
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

function isLadiesSeat(seat: any): boolean {
  const value = seat?.ladies_Seat;
  return (
    value === true ||
    value === 1 ||
    ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase())
  );
}

function isFemalePassenger(gender: string): boolean {
  return ['female', 'f', 'woman'].includes(String(gender).trim().toLowerCase());
}

function formatDobInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

function isValidDob(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && dt <= new Date() && y >= 1900;
}

/** DD/MM/YYYY -> YYYY-MM-DD ('' when invalid) */
function dobToApi(v: string): string {
  if (!isValidDob(v)) return '';
  const [d, m, y] = v.split('/');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD -> DD/MM/YYYY ('' when missing) */
function apiToDob(v?: string): string {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function ageFromDob(v: string): number {
  const [d, m, y] = v.split('/').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** Survives leaving and re-opening this screen (e.g. going back to change seats). */
const sessionCache: {
  authed: boolean;
  saved: SavedPassenger[] | null;
  contact: { mobile: string; email: string };
  draft: Omit<Passenger, 'seatIndex'>[];
} = { authed: false, saved: null, contact: { mobile: '', email: '' }, draft: [] };

function statusOf(error: any): number | undefined {
  return error?.status ?? error?.statusCode ?? error?.response?.status;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise(resolve => setTimeout(resolve, 500));
    return fn();
  }
}

/** Screen opened after the passenger details are complete. Change this if your checkout route has another name. */
const CHECKOUT_ROUTE = '/payment';

const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =====================================================
   Small building blocks
===================================================== */

function Gender({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {['Male', 'Female'].map(item => {
        const active = value.toLowerCase() === item.toLowerCase();
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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

/**
 * Bottom sheet that stays above the keyboard and the phone's navigation bar.
 * It shrinks to the space left, so the form scrolls instead of hiding behind the keyboard.
 */
function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const overlayRef = useRef<View>(null);
  const keyboardTop = useKeyboardTop();
  const { overlap, frame, measure } = useKeyboardOverlap(overlayRef, keyboardTop);
  const available = frame.h > 0 ? frame.h : windowHeight;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View ref={overlayRef} collapsable={false} onLayout={measure} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              marginBottom: overlap,
              maxHeight: Math.max(260, available - overlap - insets.top - 12),
              paddingBottom: keyboardTop != null ? 16 : 18 + insets.bottom,
            },
          ]}
        >
          <View style={styles.handle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const SeatRow = memo(function SeatRow({
  seatName,
  ladies,
  passenger,
  onAdd,
  onRemove,
}: {
  seatName: string;
  ladies: boolean;
  passenger?: Passenger;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const filled = !!passenger;
  return (
    <Pressable onPress={filled ? undefined : onAdd} style={styles.seatRow}>
      <View style={[styles.seatChip, filled && styles.seatChipFilled]}>
        <Text style={[styles.seatChipText, filled && styles.seatChipTextFilled]} numberOfLines={1}>
          {seatName}
        </Text>
      </View>

      <View style={styles.seatInfo}>
        {filled ? (
          <>
            <Text style={styles.seatPassenger} numberOfLines={1}>
              {[passenger!.title, passenger!.name].filter(Boolean).join(' ')}
            </Text>
            <Text style={styles.seatMeta}>
              {passenger!.gender} · {passenger!.age}
              {ladies ? ' · Ladies seat' : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.seatEmpty}>Add passenger</Text>
            {ladies && <Text style={[styles.seatMeta, { color: C.rose }]}>Ladies seat</Text>}
          </>
        )}
      </View>

      {filled ? (
        <Pressable onPress={onRemove} hitSlop={10} style={styles.iconButton} accessibilityLabel="Remove passenger">
          <Ionicons name="close" size={19} color={C.muted} />
        </Pressable>
      ) : (
        <Ionicons name="add" size={22} color={C.burgundy} style={{ marginRight: 10 }} />
      )}
    </Pressable>
  );
});

const SavedRow = memo(function SavedRow({
  passenger,
  selected,
  seatName,
  onToggle,
  onEdit,
}: {
  passenger: SavedPassenger;
  selected: boolean;
  seatName?: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.savedRow}>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <Ionicons name="checkmark" size={15} color={C.white} />}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.savedName} numberOfLines={1}>
          {[passenger.title, passenger.name].filter(Boolean).join(' ')}
        </Text>
        <Text style={styles.savedMeta}>
          {passenger.gender} · {passenger.age}
        </Text>
      </View>

      {selected && !!seatName && <Text style={styles.assignedSeat}>Seat {seatName}</Text>}

      <Pressable onPress={onEdit} hitSlop={8} style={styles.iconButton} accessibilityLabel="Edit passenger">
        <Ionicons name="create-outline" size={19} color={C.muted} />
      </Pressable>
    </Pressable>
  );
});

/* =====================================================
   Passenger form (shared by Add and Edit sheets)
===================================================== */

type Form = { title: string; name: string; age: string; gender: string; dob: string };
const EMPTY_FORM: Form = { title: '', name: '', age: '', gender: '', dob: '' };
const TITLES = ['Mr', 'Mrs', 'Ms'];

function validateForm(f: Form): string | null {
  if (!f.name.trim()) return "Enter the passenger's name.";
  const age = Number(f.age);
  if (!Number.isInteger(age) || age < 1 || age > 100) return 'Enter an age between 1 and 100.';
  if (!f.gender) return 'Select a gender.';
  if (f.dob && !isValidDob(f.dob)) return 'Enter date of birth as DD/MM/YYYY.';
  return null;
}

/** Body for POST / PUT /api/v1/users/passengers */
function toApiBody(f: Form) {
  const dob = dobToApi(f.dob);
  return {
    title: f.title || (isFemalePassenger(f.gender) ? 'Ms' : 'Mr'),
    name: f.name.trim(),
    ...(dob ? { date_of_birth: dob } : {}),
    age: Number(f.age),
    gender: f.gender,
  };
}

const PassengerFields = memo(function PassengerFields({
  form,
  onChange,
}: {
  form: Form;
  onChange: (patch: Partial<Form>) => void;
}) {
  return (
    <>
      <Text style={styles.label}>Title</Text>
      <View style={styles.titleRow}>
        {TITLES.map(item => {
          const active = form.title === item;
          return (
            <Pressable
              key={item}
              onPress={() => onChange({ title: item })}
              style={[styles.titleChip, active && styles.titleChipActive]}
            >
              <Text style={[styles.titleChipText, active && styles.titleChipTextActive]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Full name</Text>
      <TextInput
        value={form.name}
        onChangeText={name => onChange({ name })}
        placeholder="As on ID"
        placeholderTextColor={C.placeholder}
        autoCapitalize="words"
        style={styles.input}
      />

      <View style={styles.row}>
        <View style={{ width: 96 }}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            value={form.age}
            onChangeText={v => onChange({ age: v.replace(/[^0-9]/g, '').slice(0, 3) })}
            placeholder="Age"
            placeholderTextColor={C.placeholder}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Gender</Text>
          <Gender
            value={form.gender}
            onChange={gender =>
              onChange({
                gender,
                title: isFemalePassenger(gender)
                  ? form.title === 'Mrs' ? 'Mrs' : 'Ms'
                  : 'Mr',
              })
            }
          />
        </View>
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>
        Date of birth <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        value={form.dob}
        onChangeText={v => {
          const dob = formatDobInput(v);
          const patch: Partial<Form> = { dob };
          if (isValidDob(dob)) patch.age = String(Math.min(100, Math.max(1, ageFromDob(dob))));
          onChange(patch);
        }}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={C.placeholder}
        keyboardType="number-pad"
        maxLength={10}
        style={styles.input}
      />
    </>
  );
});

/* =====================================================
   Add passenger sheet (own form state, so typing never re-renders the page)
===================================================== */

const AddPassengerSheet = memo(function AddPassengerSheet({
  visible,
  seatName,
  authenticated,
  saving,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  seatName?: string;
  authenticated: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: Form, saveForLater: boolean) => Promise<string | null>;
}) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saveForLater, setSaveForLater] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setForm(EMPTY_FORM);
      setSaveForLater(true);
      setError('');
    }
  }, [visible]);

  const patch = useCallback((p: Partial<Form>) => setForm(f => ({ ...f, ...p })), []);

  async function submit() {
    setError('');
    const message = await onSubmit(form, saveForLater);
    if (message) setError(message);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Add passenger</Text>
                {!!seatName && <Text style={styles.sheetSubtitle}>For seat {seatName}</Text>}
              </View>
              <Pressable onPress={onClose} style={styles.iconButton} hitSlop={6}>
                <Ionicons name="close" size={22} color={C.ink} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              <PassengerFields form={form} onChange={patch} />

              {authenticated && (
                <Pressable onPress={() => setSaveForLater(v => !v)} style={styles.checkRow}>
                  <View style={[styles.checkbox, saveForLater && styles.checkboxSelected]}>
                    {saveForLater && <Ionicons name="checkmark" size={15} color={C.white} />}
                  </View>
                  <Text style={styles.checkRowText}>Save for future bookings</Text>
                </Pressable>
              )}

              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>

            <Pressable
              onPress={submit}
              disabled={saving}
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>Add passenger</Text>}
            </Pressable>
    </BottomSheet>
  );
});

/* =====================================================
   Edit saved passenger sheet
===================================================== */

const EditPassengerSheet = memo(function EditPassengerSheet({
  visible,
  passenger,
  saving,
  deleting,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  passenger: SavedPassenger | null;
  saving: boolean;
  deleting: boolean;
  onClose: () => void;
  onSave: (form: Form) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
}) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !passenger) return;
    setForm({
      title: passenger.title || (isFemalePassenger(passenger.gender) ? 'Ms' : 'Mr'),
      name: passenger.name || '',
      age: String(passenger.age ?? ''),
      gender: passenger.gender || '',
      dob: apiToDob(passenger.date_of_birth),
    });
    setError('');
  }, [visible, passenger]);

  const patch = useCallback((p: Partial<Form>) => setForm(f => ({ ...f, ...p })), []);

  async function submit() {
    setError('');
    const message = await onSave(form);
    if (message) setError(message);
  }

  async function remove() {
    setError('');
    const message = await onDelete();
    if (message) setError(message);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { flex: 1 }]}>Edit passenger</Text>
              <Pressable onPress={remove} disabled={deleting || saving} style={styles.iconButton} hitSlop={6}>
                {deleting ? (
                  <ActivityIndicator color={C.error} size="small" />
                ) : (
                  <Ionicons name="trash-outline" size={20} color={C.error} />
                )}
              </Pressable>
              <Pressable onPress={onClose} style={styles.iconButton} hitSlop={6}>
                <Ionicons name="close" size={22} color={C.ink} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              <PassengerFields form={form} onChange={patch} />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>

            <Pressable
              onPress={submit}
              disabled={saving || deleting}
              style={[styles.primaryButton, (saving || deleting) && styles.buttonDisabled]}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>Save changes</Text>}
            </Pressable>
    </BottomSheet>
  );
});


/* =====================================================
   Screen
===================================================== */

export default function Passengers() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const keyboardTop = useKeyboardTop();
  const { overlap: keyboardOverlap, measure: measureRoot } = useKeyboardOverlap(rootRef, keyboardTop);
  const isWide = width >= 640;

  // Calm, non-blocking message (replaces Alert boxes). Messages that belong to an open sheet show inside it.
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
  const scrollRef = useRef<ScrollView>(null);

  // Parse the route JSON once (expo-router params are strings).
  const bus = useMemo(() => parseJson(routeParams.bus) || {}, [routeParams.bus]);
  const selectedSeats = useMemo(() => asArray(routeParams.selectedSeats), [routeParams.selectedSeats]);
  const boarding = useMemo(
    () => parseJson(routeParams.selectedBoardingPoint) || parseJson(routeParams.defaultBoarding),
    [routeParams.selectedBoardingPoint, routeParams.defaultBoarding]
  );
  const dropping = useMemo(
    () => parseJson(routeParams.selectedDroppingPoint) || parseJson(routeParams.defaultDropping),
    [routeParams.selectedDroppingPoint, routeParams.defaultDropping]
  );

  const seatNames = useMemo(
    () => selectedSeats.map((seat, index) => getSeatName(seat, index)),
    [selectedSeats]
  );
  const totalFare = Number(str(routeParams.totalFare) || 0); // includes taxes: used at checkout, not shown here
  // Shown here: the sum of each seat's basic fare, exactly as on the seat screen.
  const baseFare = useMemo(
    () => selectedSeats.reduce((sum: number, seat: any) => sum + (Number(seat?.fareMaster?.basic_Amount) || 0), 0),
    [selectedSeats]
  );

  // Re-fill passengers from the last visit (e.g. after changing seats), respecting ladies seats.
  const [passengers, setPassengers] = useState<Passenger[]>(() => {
    const result: Passenger[] = [];
    const taken = new Set<number>();
    for (const draft of sessionCache.draft) {
      const female = isFemalePassenger(draft.gender);
      const index = selectedSeats.findIndex(
        (seat, i) => !taken.has(i) && (!isLadiesSeat(seat) || female)
      );
      if (index < 0) continue;
      taken.add(index);
      result.push({ ...draft, seatIndex: index });
    }
    return result;
  });
  const [mobile, setMobile] = useState(sessionCache.contact.mobile);
  const [email, setEmail] = useState(sessionCache.contact.email);
  const [accountError, setAccountError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [loginVisible, setLoginVisible] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const otpInputRef = useRef<TextInput>(null);
  const otpShake = useRef(new Animated.Value(0)).current;

  const [authLoading, setAuthLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(sessionCache.authed);
  const [savedPassengers, setSavedPassengers] = useState<SavedPassenger[]>(sessionCache.saved ?? []);

  const [showAdd, setShowAdd] = useState(false);
  const [addTarget, setAddTarget] = useState<number | null>(null);
  const [savingPassenger, setSavingPassenger] = useState(false);
  const [editingPassenger, setEditingPassenger] = useState<SavedPassenger | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);

  useEffect(() => {
    sessionCache.draft = passengers.map(({ seatIndex, ...rest }) => rest);
  }, [passengers]);

  useEffect(() => {
    sessionCache.contact = { mobile, email };
  }, [mobile, email]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Contact currently stored on the account (to know whether a PUT is needed).
  const savedContact = useRef({ mobile: '', email: '' });

  /** GET /api/v1/users/contact-details and prefill the form. */
  async function loadContact() {
    const res: any = await request<any>('/api/v1/users/contact-details');
    const data = res?.data ?? res ?? {};
    const m = String(data.mobile_number ?? '').replace(/\D/g, '').slice(-10);
    const e = String(data.email ?? '');
    savedContact.current = { mobile: m, email: e };
    if (!mounted.current) return;
    if (m) setMobile(m);
    if (e) setEmail(e);
  }

  /** Load saved passengers + contact for a signed-in user. 401 => back to guest. */
  async function loadAccount() {
    let unauthorized = false;
    let failed = false;

    try {
      await withRetry(refreshSavedPassengers);
    } catch (error) {
      console.warn('[Passengers] saved passengers failed', error);
      if (statusOf(error) === 401) unauthorized = true;
      else failed = true;
    }

    if (!unauthorized) {
      try {
        await withRetry(loadContact);
      } catch (error) {
        console.warn('[Passengers] contact details failed', error);
        if (statusOf(error) === 401) unauthorized = true;
      }
    }

    if (!mounted.current) return;
    if (unauthorized) {
      await clearTokens().catch(() => undefined);
      sessionCache.authed = false;
      sessionCache.saved = null;
      setIsAuthenticated(false);
      setSavedPassengers([]);
      return;
    }
    setAccountError(failed);
  }

  // Restore login from persisted tokens.
  useEffect(() => {
    (async () => {
      try {
        const tokens = await getTokens();
        if (!tokens || !mounted.current) return;
        sessionCache.authed = true;
        setIsAuthenticated(true);
        await loadAccount();
      } catch {
        // Guest checkout stays available if token storage cannot be read.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!otpStep || otpCountdown <= 0) return;
    const timer = setInterval(() => setOtpCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [otpStep, otpCountdown]);

  function handleSignIn() {
    setPhoneError('');
    setOtpStep(false);
    setOtp('');
    setOtpError('');
    setOtpCountdown(0);
    setLoginVisible(true);
  }

  function shakeOtp() {
    otpShake.setValue(0);
    Animated.sequence([
      Animated.timing(otpShake, { toValue: 9, duration: 55, useNativeDriver: true }),
      Animated.timing(otpShake, { toValue: -9, duration: 55, useNativeDriver: true }),
      Animated.timing(otpShake, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(otpShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') Vibration.vibrate(160);
  }

  function readableApiError(error: any, fallback: string) {
    const raw = error?.message ?? error?.detail ?? fallback;
    if (typeof raw !== 'string') return fallback;
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart));
        return parsed?.message || parsed?.detail || fallback;
      } catch {
        return fallback;
      }
    }
    return raw || fallback;
  }

  async function refreshSavedPassengers() {
    const result: any = await request<any>('/api/v1/users/passengers');
    const raw = Array.isArray(result) ? result : result?.passengers ?? result?.data ?? [];
    const list: SavedPassenger[] = Array.isArray(raw) ? raw : [];
    sessionCache.saved = list;
    if (mounted.current) setSavedPassengers(list);
    return list;
  }

  async function handleSendOTP() {
    const number = mobile.trim();
    if (!MOBILE_RE.test(number)) {
      setPhoneError('Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      setAuthLoading(true);
      setPhoneError('');
      await sendOTP(number);
      setOtpStep(true);
      setOtp('');
      setOtpError('');
      setOtpCountdown(60);
    } catch (error: any) {
      const message = readableApiError(error, "We couldn't send the OTP. Please try again.");
      if (otpStep) setOtpError(message);
      else setPhoneError(message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Please enter all 6 digits.');
      shakeOtp();
      return;
    }
    try {
      setAuthLoading(true);
      setOtpError('');
      const result = await verifyOTP(mobile.trim(), otp);
      await saveTokens({ access_token: result.access_token, refresh_token: result.refresh_token });
      sessionCache.authed = true;
      setIsAuthenticated(true);
      setLoginVisible(false);
      setOtpStep(false);
      setOtp('');
      await loadAccount();
    } catch (error: any) {
      const status = error?.status ?? error?.statusCode ?? error?.response?.status;
      setOtpError(
        status === 401
          ? 'Invalid or expired OTP. Please try again.'
          : readableApiError(error, 'Verification failed. Please try again.')
      );
      setOtp('');
      shakeOtp();
    } finally {
      setAuthLoading(false);
    }
  }

  /* ---- seat assignment ---- */

  const passengerBySeat = useMemo(() => {
    const map = new Map<number, Passenger>();
    passengers.forEach(p => map.set(p.seatIndex, p));
    return map;
  }, [passengers]);

  function nextCompatibleSeat(gender: string): number {
    const female = isFemalePassenger(gender);
    return selectedSeats.findIndex((seat, index) => {
      if (passengerBySeat.has(index)) return false;
      if (isLadiesSeat(seat) && !female) return false;
      return true;
    });
  }

  function toggleSavedPassenger(saved: SavedPassenger) {
    if (passengers.some(p => p.passengerId === saved.passenger_id)) {
      setPassengers(current => current.filter(p => p.passengerId !== saved.passenger_id));
      return;
    }

    let seatIndex = nextCompatibleSeat(saved.gender);

    // Seats are full: swap with the most recently added passenger instead of refusing.
    if (seatIndex < 0) {
      const female = isFemalePassenger(saved.gender);
      const replaced = [...passengers]
        .reverse()
        .find(p => female || !isLadiesSeat(selectedSeats[p.seatIndex]));
      if (!replaced) {
        if (Platform.OS !== 'web') Vibration.vibrate(250);
        showToast('The remaining seats are reserved for female passengers.');
        return;
      }
      seatIndex = replaced.seatIndex;
    }

    setPassengers(current => [
      ...current.filter(p => p.seatIndex !== seatIndex),
      {
        title: saved.title,
        dob: saved.date_of_birth,
        name: saved.name,
        age: String(saved.age ?? ''),
        gender: saved.gender,
        passengerId: saved.passenger_id,
        seatIndex,
      },
    ]);
  }

  const openAdd = useCallback((seatIndex: number | null) => {
    setAddTarget(seatIndex);
    setShowAdd(true);
  }, []);

  const removeFromSeat = useCallback((seatIndex: number) => {
    setPassengers(current => current.filter(p => p.seatIndex !== seatIndex));
  }, []);

  /** Returns null on success, or a short message to show in the sheet. */
  async function addPassenger(form: Form, saveForLater: boolean): Promise<string | null> {
    const problem = validateForm(form);
    if (problem) return problem;
    const body = toApiBody(form);

    let seatIndex: number;
    if (addTarget !== null) {
      if (isLadiesSeat(selectedSeats[addTarget]) && !isFemalePassenger(form.gender)) {
        return 'This seat is reserved for female passengers.';
      }
      seatIndex = addTarget;
    } else {
      seatIndex = nextCompatibleSeat(form.gender);
      if (seatIndex < 0) {
        return passengers.length >= selectedSeats.length
          ? 'All seats already have a passenger. Tap a seat above to replace one.'
          : 'The remaining seats are ladies-only. Tap a seat to assign this passenger.';
      }
    }

    let passengerId: string | undefined;

    if (isAuthenticated && saveForLater) {
      try {
        setSavingPassenger(true);
        await request('/api/v1/users/passengers', { method: 'POST', body: JSON.stringify(body) });
        const list = await refreshSavedPassengers();
        passengerId = list.find(
          item =>
            item.name?.trim().toLowerCase() === body.name.toLowerCase() &&
            Number(item.age) === body.age &&
            item.gender?.toLowerCase() === body.gender.toLowerCase()
        )?.passenger_id;
      } catch (error: any) {
        return readableApiError(error, 'Unable to save passenger. Please try again.');
      } finally {
        setSavingPassenger(false);
      }
    }

    setPassengers(current => [
      ...current.filter(p => p.seatIndex !== seatIndex),
      {
        title: body.title,
        dob: body.date_of_birth,
        name: body.name,
        age: String(body.age),
        gender: body.gender,
        passengerId,
        seatIndex,
      },
    ]);
    setShowAdd(false);
    return null;
  }

  async function updateSavedPassenger(form: Form): Promise<string | null> {
    if (!editingPassenger) return null;
    const problem = validateForm(form);
    if (problem) return problem;
    const body = toApiBody(form);

    try {
      setEditSaving(true);
      await request(`/api/v1/users/passengers/${editingPassenger.passenger_id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      await refreshSavedPassengers();
      setPassengers(current =>
        current.map(p =>
          p.passengerId === editingPassenger.passenger_id
            ? { ...p, title: body.title, dob: body.date_of_birth, name: body.name, age: String(body.age), gender: body.gender }
            : p
        )
      );
      setEditingPassenger(null);
      return null;
    } catch (error: any) {
      return readableApiError(error, 'Unable to update passenger. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteSavedPassenger(): Promise<string | null> {
    if (!editingPassenger) return null;
    const id = editingPassenger.passenger_id;
    try {
      setEditDeleting(true);
      await request(`/api/v1/users/passengers/${id}`, { method: 'DELETE' });
      setSavedPassengers(current => {
        const next = current.filter(p => p.passenger_id !== id);
        sessionCache.saved = next;
        return next;
      });
      setPassengers(current => current.filter(p => p.passengerId !== id));
      setEditingPassenger(null);
      return null;
    } catch (error: any) {
      return readableApiError(error, "Couldn't delete this passenger. Please try again.");
    } finally {
      setEditDeleting(false);
    }
  }

  /* ---- continue ---- */

  const mobileValid = MOBILE_RE.test(mobile.trim());
  const emailValid = EMAIL_RE.test(email.trim()); // email is required

  async function validateAndContinue() {
    if (!selectedSeats.length) {
      showToast('No seats selected. Please go back and choose seats.');
      return;
    }

    if (passengers.length !== selectedSeats.length) {
      const remaining = selectedSeats.length - passengers.length;
      showToast(`Add ${remaining} more passenger${remaining > 1 ? 's' : ''} to continue.`);
      return;
    }

    for (const passenger of passengers) {
      if (isLadiesSeat(selectedSeats[passenger.seatIndex]) && !isFemalePassenger(passenger.gender)) {
        showToast('Ladies-only seats need a female passenger.');
        return;
      }
    }

    if (!mobileValid || !emailValid) {
      setSubmitted(true);
      showToast(!mobileValid ? 'Please enter a valid mobile number.' : 'Please enter your email address.');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }

    // Keep the account's contact details in sync (never blocks the booking).
    if (
      isAuthenticated &&
      (mobile.trim() !== savedContact.current.mobile || email.trim() !== savedContact.current.email)
    ) {
      try {
        setSavingContact(true);
        await request('/api/v1/users/contact-details', {
          method: 'PUT',
          body: JSON.stringify({
            mobile_number: mobile.trim(),
            email: email.trim(),
          }),
        });
        savedContact.current = { mobile: mobile.trim(), email: email.trim() };
      } catch (error) {
        console.warn('[StableBus] Could not update contact details', error);
      } finally {
        if (mounted.current) setSavingContact(false);
      }
    }

    const orderedPassengers = [...passengers].sort((a, b) => a.seatIndex - b.seatIndex);

    const passengerPayload = orderedPassengers.map(passenger => ({
      title: passenger.title || (isFemalePassenger(passenger.gender) ? 'Ms' : 'Mr'),
      name: passenger.name.trim(),
      ...(passenger.dob ? { date_of_birth: passenger.dob } : {}),
      age: Number(passenger.age),
      gender: passenger.gender,
      seat: seatNames[passenger.seatIndex],
      seatKey: selectedSeats[passenger.seatIndex]?.seat_Key,
      ...(passenger.passengerId ? { passenger_id: passenger.passengerId } : {}),
    }));

    const contact = { mobile: mobile.trim(), email: email.trim() };

    // Hand everything to checkout (expo-router params are strings). `totalFare` includes taxes;
    // checkout is where the payable amount is shown.
    const forward: Record<string, string> = {};
    for (const [key, value] of Object.entries(routeParams)) {
      forward[key] = Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
    }

    console.log('[StableBus] Passenger details validated:', {
      passengers: passengerPayload,
      contact,
      selectedSeats: seatNames,
      selectedBoardingPoint: boarding,
      selectedDroppingPoint: dropping,
      totalFare,
    });

    router.push({
      pathname: CHECKOUT_ROUTE as any,
      params: {
        ...forward,
        passengers: JSON.stringify(passengerPayload),
        contact: JSON.stringify(contact),
        selectedBoardingPoint: JSON.stringify(boarding ?? {}),
        selectedDroppingPoint: JSON.stringify(dropping ?? {}),
        totalFare: String(totalFare),
        baseFare: String(baseFare),
      },
    });
  }

  const sheetOpen = showAdd || !!editingPassenger || loginVisible;
  const focusContact = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
  const busName = bus.operator_Name || bus.travel_Name || 'Selected bus';
  const from = str(routeParams.from) || 'Departure';
  const to = str(routeParams.to) || 'Destination';
  const dateLabel = formatDate(str(routeParams.date));
  const remaining = selectedSeats.length - passengers.length;
  const boardingTime = getPointTime(boarding, 'boarding');
  const droppingTime = getPointTime(dropping, 'dropping');

  return (
    <View ref={rootRef} collapsable={false} onLayout={measureRoot} style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={{ flex: 1, paddingBottom: sheetOpen ? 0 : keyboardOverlap }}>
        <View style={[styles.header, isWide && styles.wide, { paddingTop: 10 + insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={21} color={C.ink} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Passenger details</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {[`${from} → ${to}`, dateLabel].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, isWide && styles.wide]}
          keyboardShouldPersistTaps="handled"
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
                  <Text style={styles.datePillText}>{dateLabel}</Text>
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

            {/* tear line */}
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
                <Text style={styles.metaValue} numberOfLines={2}>{getPointName(boarding, 'boarding')}</Text>
                {!!boardingTime && <Text style={styles.metaTime}>{boardingTime}</Text>}
              </View>

              <View style={styles.ticketCol}>
                <View style={styles.ticketLabelRow}>
                  <Ionicons name="flag-outline" size={14} color={C.burgundy} />
                  <Text style={styles.metaLabel}>Dropping</Text>
                </View>
                <Text style={styles.metaValue} numberOfLines={2}>{getPointName(dropping, 'dropping')}</Text>
                {!!droppingTime && <Text style={styles.metaTime}>{droppingTime}</Text>}
              </View>
            </View>

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
          </View>

          {/* Passengers, one row per seat */}
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Passengers</Text>
            <Text style={styles.sectionMeta}>
              {passengers.length} of {selectedSeats.length}
            </Text>
          </View>

          <View style={styles.card}>
            {selectedSeats.map((seat, index) => (
              <View key={`${seatNames[index]}-${index}`}>
                {index > 0 && <View style={styles.divider} />}
                <SeatRow
                  seatName={seatNames[index]}
                  ladies={isLadiesSeat(seat)}
                  passenger={passengerBySeat.get(index)}
                  onAdd={() => openAdd(index)}
                  onRemove={() => removeFromSeat(index)}
                />
              </View>
            ))}
            {!selectedSeats.length && (
              <Text style={styles.emptyText}>No seats selected. Please go back and select seats.</Text>
            )}
          </View>

          {/* Saved passengers / sign in */}
          {isAuthenticated ? (
            savedPassengers.length === 0 && accountError ? (
              <Pressable onPress={loadAccount} style={styles.signInRow}>
                <Ionicons name="refresh-outline" size={20} color={C.burgundy} />
                <Text style={styles.signInText}>Couldn't load saved passengers. Tap to retry</Text>
              </Pressable>
            ) : savedPassengers.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Saved passengers</Text>
                </View>
                <View style={styles.card}>
                  {savedPassengers.map((saved, index) => {
                    const assigned = passengers.find(p => p.passengerId === saved.passenger_id);
                    return (
                      <View key={saved.passenger_id}>
                        {index > 0 && <View style={styles.divider} />}
                        <SavedRow
                          passenger={saved}
                          selected={!!assigned}
                          seatName={assigned ? seatNames[assigned.seatIndex] : undefined}
                          onToggle={() => toggleSavedPassenger(saved)}
                          onEdit={() => setEditingPassenger(saved)}
                        />
                      </View>
                    );
                  })}
                </View>
              </>
            )
          ) : (
            <Pressable onPress={handleSignIn} style={styles.signInRow}>
              <Ionicons name="person-circle-outline" size={22} color={C.burgundy} />
              <Text style={styles.signInText}>Sign in to use saved passengers</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          )}

          <Pressable onPress={() => openAdd(null)} style={styles.addButton}>
            <Ionicons name="add" size={20} color={C.burgundy} />
            <Text style={styles.addButtonText}>Add passenger</Text>
          </Pressable>

          {/* Contact */}
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <Text style={styles.sectionMeta}>
              {isAuthenticated ? 'Saved to your account' : 'Booking updates are sent here'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Mobile number</Text>
            <View style={[styles.phoneInput, submitted && !mobileValid && styles.inputError]}>
              <Text style={styles.countryCode}>+91</Text>
              <View style={styles.phoneDivider} />
              <TextInput
                value={mobile}
                onChangeText={v => setMobile(v.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                placeholderTextColor={C.placeholder}
                keyboardType="phone-pad"
                maxLength={10}
                onFocus={focusContact}
                style={styles.phoneTextInput}
              />
            </View>
            {submitted && !mobileValid && (
              <Text style={styles.errorText}>Enter a valid 10-digit mobile number.</Text>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={focusContact}
              style={[styles.input, submitted && !emailValid && styles.inputError]}
            />
            {submitted && !emailValid && (
              <Text style={styles.errorText}>
                {email.trim() ? 'Enter a valid email address.' : 'Enter your email address.'}
              </Text>
            )}
          </View>

          <Text style={styles.note}>Please check names and ages carefully before continuing.</Text>
        </ScrollView>

        <View
          style={[
            styles.bottomBar,
            isWide && styles.wide,
            { paddingBottom: sheetOpen || keyboardTop == null ? 12 + insets.bottom : 12 },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.fareLabel} numberOfLines={1}>
              {remaining > 0
                ? `Add ${remaining} more passenger${remaining > 1 ? 's' : ''}`
                : `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'} · all set`}
            </Text>
            <Text style={styles.fareValue}>{formatFare(baseFare)}</Text>
          </View>

          <Pressable
            onPress={validateAndContinue}
            disabled={savingContact}
            style={[styles.continueButton, savingContact && styles.buttonDisabled]}
          >
            {savingContact ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <Text style={styles.continueText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={C.white} />
              </>
            )}
          </Pressable>
        </View>
      </View>

      <AddPassengerSheet
        visible={showAdd}
        seatName={addTarget !== null ? seatNames[addTarget] : undefined}
        authenticated={isAuthenticated}
        saving={savingPassenger}
        onClose={() => setShowAdd(false)}
        onSubmit={addPassenger}
      />

      <EditPassengerSheet
        visible={!!editingPassenger}
        passenger={editingPassenger}
        saving={editSaving}
        deleting={editDeleting}
        onClose={() => setEditingPassenger(null)}
        onSave={updateSavedPassenger}
        onDelete={deleteSavedPassenger}
      />

      {/* Sign in */}
      <BottomSheet visible={loginVisible} onClose={() => setLoginVisible(false)}>
        <View>

              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{otpStep ? 'Verify your number' : 'Sign in'}</Text>
                  <Text style={styles.sheetSubtitle}>
                    {otpStep ? `Enter the OTP sent to +91 ${mobile}` : 'Use your saved passengers and bookings'}
                  </Text>
                </View>
                <Pressable onPress={() => setLoginVisible(false)} style={styles.iconButton} hitSlop={6}>
                  <Ionicons name="close" size={22} color={C.ink} />
                </Pressable>
              </View>

              {!otpStep ? (
                <>
                  <Text style={styles.label}>Mobile number</Text>
                  <View style={styles.phoneInput}>
                    <Text style={styles.countryCode}>+91</Text>
                    <View style={styles.phoneDivider} />
                    <TextInput
                      value={mobile}
                      onChangeText={v => setMobile(v.replace(/[^0-9]/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      placeholderTextColor={C.placeholder}
                      keyboardType="phone-pad"
                      maxLength={10}
                      autoFocus
                      style={styles.phoneTextInput}
                    />
                  </View>
                  {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}

                  <Pressable
                    onPress={handleSendOTP}
                    disabled={authLoading}
                    style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
                  >
                    {authLoading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>Send OTP</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => otpInputRef.current?.focus()} style={{ width: '100%' }}>
                    <Animated.View style={[styles.otpRow, { transform: [{ translateX: otpShake }] }]}>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.otpBox,
                            otp.length === index && !otpError && styles.otpBoxActive,
                            !!otpError && styles.otpBoxError,
                          ]}
                        >
                          <Text style={styles.otpDigit}>{otp[index] || ''}</Text>
                        </View>
                      ))}
                    </Animated.View>

                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={v => {
                        setOtp(v.replace(/[^0-9]/g, '').slice(0, 6));
                        setOtpError('');
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      caretHidden
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      style={styles.hiddenInput}
                    />
                  </Pressable>

                  {!!otpError && <Text style={styles.errorText}>{otpError}</Text>}

                  <Pressable
                    onPress={handleVerifyOTP}
                    disabled={authLoading}
                    style={[styles.primaryButton, authLoading && styles.buttonDisabled]}
                  >
                    {authLoading ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryText}>Verify & sign in</Text>}
                  </Pressable>

                  <View style={styles.otpActions}>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        setOtpStep(false);
                        setOtp('');
                        setOtpError('');
                      }}
                    >
                      <Text style={styles.linkText}>Change number</Text>
                    </Pressable>

                    <Pressable hitSlop={8} disabled={otpCountdown > 0 || authLoading} onPress={handleSendOTP}>
                      <Text style={[styles.linkText, otpCountdown > 0 && { color: C.muted }]}>
                        {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend OTP'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
        </View>
      </BottomSheet>

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
   Styles: quiet type, light borders, 44px+ touch targets
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
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.paper,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { color: C.ink, fontSize: 17, fontWeight: '600' },
  headerSubtitle: { color: C.muted, fontSize: 13, marginTop: 3 },

  content: { padding: 14, paddingBottom: 28 },

  card: {
    backgroundColor: C.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  divider: { height: 1, backgroundColor: C.border },

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
  datePillText: { color: C.burgundy, fontSize: 12, fontWeight: '600' },

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

  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  sectionMeta: { color: C.muted, fontSize: 13 },

  seatRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  seatChip: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  seatChipFilled: { backgroundColor: C.burgundyLight, borderColor: C.burgundyLight },
  seatChipText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  seatChipTextFilled: { color: C.burgundy },
  seatInfo: { flex: 1, minWidth: 0 },
  seatPassenger: { color: C.ink, fontSize: 15, fontWeight: '500' },
  seatEmpty: { color: C.burgundy, fontSize: 15 },
  seatMeta: { color: C.muted, fontSize: 13, marginTop: 3 },

  savedRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  savedName: { color: C.ink, fontSize: 15, fontWeight: '500' },
  savedMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  assignedSeat: { color: C.burgundy, fontSize: 13 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#CFC3B9',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.burgundy, borderColor: C.burgundy },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signInRow: {
    marginTop: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
  },
  signInText: { flex: 1, color: C.ink, fontSize: 14 },

  addButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addButtonText: { color: C.burgundy, fontSize: 15, fontWeight: '500' },

  emptyText: { color: C.muted, fontSize: 14, paddingVertical: 16 },
  note: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 18 },

  /* inputs */
  label: { color: C.muted, fontSize: 13, marginBottom: 6, marginTop: 4 },
  optional: { color: C.placeholder },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: C.white,
    color: C.ink,
    fontSize: 16,
  },
  inputError: { borderColor: C.error },
  errorText: { color: C.error, fontSize: 13, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 10 },

  segmented: {
    height: 48,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: C.burgundyLight },
  segmentText: { color: C.muted, fontSize: 14 },
  segmentTextActive: { color: C.burgundy, fontWeight: '600' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 6 },
  checkRowText: { color: C.ink, fontSize: 14 },

  phoneInput: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
    paddingHorizontal: 14,
  },
  countryCode: { color: C.ink, fontSize: 16 },
  phoneDivider: { width: 1, height: 22, backgroundColor: C.border, marginHorizontal: 12 },
  phoneTextInput: { flex: 1, color: C.ink, fontSize: 16, paddingVertical: 0 },

  /* bottom bar */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fareLabel: { color: C.muted, fontSize: 13 },
  fareValue: { color: C.ink, fontSize: 19, fontWeight: '700', marginTop: 3 },
  continueButton: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueText: { color: C.white, fontSize: 15, fontWeight: '600' },

  /* sheets */
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(35, 25, 23, 0.36)' },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },

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
    backgroundColor: C.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: { flexShrink: 1, color: C.white, fontSize: 14 },
  titleRow: { flexDirection: 'row', gap: 8 },
  titleChip: {
    minWidth: 60,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleChipActive: { backgroundColor: C.burgundyLight, borderColor: C.burgundyLight },
  titleChipText: { color: C.muted, fontSize: 14 },
  titleChipTextActive: { color: C.burgundy, fontWeight: '600' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { color: C.ink, fontSize: 18, fontWeight: '600' },
  sheetSubtitle: { color: C.muted, fontSize: 13, marginTop: 3 },
  primaryButton: {
    height: 52,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryText: { color: C.white, fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },

  otpRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  otpBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: C.burgundy },
  otpBoxError: { borderColor: C.error },
  otpDigit: { color: C.ink, fontSize: 20, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  linkText: { color: C.burgundy, fontSize: 14, paddingVertical: 4 },
});