import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Vibration,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendOTP, verifyOTP } from '@/features/auth/api';
import { saveTokens, getTokens, clearTokens } from '@/features/auth/tokenStorage';
import { request } from '@/services/http';

const C = {
  bg: '#F8F4ED',
  paper: '#FFFEFC',
  ink: '#382B28',
  muted: '#887A73',
  border: '#EAE0D7',
  burgundy: '#783D4A',
  burgundyLight: '#F4EAEB',
  white: '#FFFFFF',
  green: '#47765B',
  input: '#FFFEFC',
  error: '#C34242',
};

type Passenger = {
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
};

function formatFare(value: number): string {
  return `₹${value.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;
}

function getSeatName(seat: any, index: number): string {
  return String(
    seat?.seat_Number ??
    seat?.seat_Name ??
    seat?.seatNo ??
    seat?.seat_Key ??
    `Seat ${index + 1}`
  );
}

function getPointName(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return 'Not selected';

  const prefix = type === 'boarding' ? 'boarding' : 'dropping';

  return String(
    point?.[`${prefix}_Name`] ??
    point?.[`${prefix}Name`] ??
    point?.point_Name ??
    point?.pointName ??
    point?.name ??
    'Selected point'
  );
}

function getPointTime(point: any, type: 'boarding' | 'dropping'): string {
  if (!point) return '';

  const prefix = type === 'boarding' ? 'boarding' : 'dropping';

  return String(
    point?.[`${prefix}_Time`] ??
    point?.time ??
    ''
  );
}

function formatTime(value: string): string {
  if (!value) return '';

  if (/am|pm/i.test(value)) return value.toUpperCase();

  const match = value.match(/^(\d{1,2}):(\d{2})/);

  if (!match) return value;

  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';

  return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${suffix}`;
}

function SavedPassengerRow({
  passenger,
  selected,
  seatName,
  disabled,
  editing,
  editValue,
  onToggle,
  onEdit,
  onDelete,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
}: {
  passenger: SavedPassenger;
  selected: boolean;
  seatName?: string;
  disabled: boolean;
  editing: boolean;
  editValue: { name: string; age: string; gender: string };
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditChange: (field: 'name' | 'age' | 'gender', value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  savingEdit: boolean;
}) {
  const initial = passenger.name?.trim()?.charAt(0)?.toUpperCase() || '?';

  const genderShort =
    passenger.gender?.toLowerCase() === 'female'
      ? 'F'
      : passenger.gender?.toLowerCase() === 'male'
        ? 'M'
        : 'O';

  return (
    <View
      style={[
        styles.savedRowWrap,
        selected && styles.savedRowWrapSelected,
        disabled && styles.savedRowWrapDisabled,
      ]}
    >
      <View style={styles.savedRow}>
        <Pressable
          onPress={onToggle}
          disabled={disabled && !selected}
          style={styles.savedRowSelect}
        >
          <View
            style={[
              styles.checkbox,
              selected && styles.checkboxSelected,
              disabled && styles.checkboxDisabled,
            ]}
          >
            {selected && (
              <Ionicons name="checkmark" size={14} color={C.white} />
            )}
          </View>

          <View style={styles.savedAvatar}>
            <Text style={styles.savedAvatarText}>{initial}</Text>
          </View>

          <View style={styles.savedInfo}>
            <Text
              style={[
                styles.savedName,
                disabled && styles.disabledSavedText,
              ]}
              numberOfLines={1}
            >
              {passenger.name}
            </Text>

            <Text style={styles.savedMeta}>
              {genderShort} · {passenger.age}
              {disabled ? ' · No standard seats left' : ''}
            </Text>
          </View>

          {selected && seatName ? (
            <View style={styles.assignedSeat}>
              <Ionicons
                name="ticket-outline"
                size={13}
                color={C.green}
              />
              <Text style={styles.assignedSeatText}>{seatName}</Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={onEdit}
          style={styles.rowAction}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={17} color={C.muted} />
        </Pressable>

        <Pressable
          onPress={onDelete}
          style={styles.rowAction}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={17} color={C.error} />
        </Pressable>
      </View>

      {editing && (
        <View style={styles.inlineEditPanel}>
          <TextInput
            value={editValue.name}
            onChangeText={value => onEditChange('name', value)}
            placeholder="Full name"
            placeholderTextColor="#A99D95"
            autoCapitalize="words"
            style={styles.inlineEditInput}
          />

          <TextInput
            value={editValue.age}
            onChangeText={value =>
              onEditChange(
                'age',
                value.replace(/[^0-9]/g, '').slice(0, 3)
              )
            }
            placeholder="Age"
            placeholderTextColor="#A99D95"
            keyboardType="number-pad"
            style={[
              styles.inlineEditInput,
              styles.inlineAgeInput,
            ]}
          />

          <View style={styles.inlineGenderRow}>
            {['Male', 'Female', 'Other'].map(gender => (
              <Pressable
                key={gender}
                onPress={() => onEditChange('gender', gender)}
                style={[
                  styles.genderOption,
                  styles.inlineGenderOption,
                  editValue.gender === gender &&
                    styles.genderOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.genderText,
                    editValue.gender === gender &&
                      styles.genderTextSelected,
                  ]}
                >
                  {gender}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inlineEditActions}>
            <Pressable
              onPress={onCancelEdit}
              style={styles.cancelPassengerButton}
            >
              <Text style={styles.cancelPassengerText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={onSaveEdit}
              disabled={savingEdit}
              style={styles.savePassengerButton}
            >
              {savingEdit ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Ionicons
                  name="checkmark"
                  size={15}
                  color={C.white}
                />
              )}

              <Text style={styles.savePassengerButtonText}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function PassengerForm({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: Passenger;
  onChange: (field: 'name' | 'age' | 'gender', value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <View style={styles.passengerCard}>
      <Text style={styles.passengerTitle}>New passenger details</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={value.name}
          onChangeText={v => onChange('name', v)}
          placeholder="Enter full name"
          placeholderTextColor="#A99D95"
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Age</Text>
        <TextInput
          value={value.age}
          onChangeText={v =>
            onChange('age', v.replace(/[^0-9]/g, '').slice(0, 3))
          }
          placeholder="Enter age"
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Gender</Text>

        <View style={styles.genderRow}>
          {['Male', 'Female', 'Other'].map(g => (
            <Pressable
              key={g}
              onPress={() => onChange('gender', g)}
              style={[
                styles.genderOption,
                value.gender === g && styles.genderOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.genderText,
                  value.gender === g && styles.genderTextSelected,
                ]}
              >
                {g}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.formActions}>
        <Pressable
          onPress={onCancel}
          style={styles.cancelPassengerButton}
        >
          <Text style={styles.cancelPassengerText}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={styles.savePassengerButton}
        >
          {saving ? (
            <ActivityIndicator color={C.white} size="small" />
          ) : (
            <Ionicons
              name="bookmark-outline"
              size={15}
              color={C.white}
            />
          )}

          <Text style={styles.savePassengerButtonText}>
            {saving ? 'Saving…' : 'Save passenger'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function Passengers({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const params = route?.params || {};
  const bus = params.bus || {};

  const selectedSeats: any[] = Array.isArray(params.selectedSeats)
    ? params.selectedSeats
    : [];

  const boarding = params.selectedBoardingPoint || params.defaultBoarding;
  const dropping = params.selectedDroppingPoint || params.defaultDropping;

  const seatNames = useMemo(
    () => selectedSeats.map((seat, index) => getSeatName(seat, index)),
    [selectedSeats]
  );

  const totalFare = Number(params.totalFare || 0);

  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [loginVisible, setLoginVisible] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState('');

  const otpInputRef = useRef<TextInput>(null);
  const otpShake = useRef(new Animated.Value(0)).current;

  const [authLoading, setAuthLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savedPassengers, setSavedPassengers] = useState<SavedPassenger[]>([]);

  const [showAddPassenger, setShowAddPassenger] = useState(false);
  const [draftPassenger, setDraftPassenger] = useState<Passenger>({
    name: '',
    age: '',
    gender: '',
    seatIndex: -1,
  });
  const [savingPassenger, setSavingPassenger] = useState(false);

  const [editingPassengerId, setEditingPassengerId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: '',
    age: '',
    gender: '',
  });
  const [updatingPassenger, setUpdatingPassenger] = useState(false);
  const [deletingPassengerId, setDeletingPassengerId] = useState<string | null>(null);

  // Restore login from persisted tokens when this screen is opened again.
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const tokens = await getTokens();
        if (!tokens || !active) return;

        setIsAuthenticated(true);

        try {
          const saved = await request<SavedPassenger[]>(
            '/api/v1/users/passengers'
          );

          if (active) {
            setSavedPassengers(Array.isArray(saved) ? saved : []);
          }
        } catch (error: any) {
          const status =
            error?.status ??
            error?.statusCode ??
            error?.response?.status;

          if (status === 401) {
            await clearTokens().catch(() => undefined);

            if (active) {
              setIsAuthenticated(false);
            }
          }
        }
      } catch {
        // Keep guest checkout available if token storage cannot be read.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!otpStep || otpCountdown <= 0) return;

    const timer = setInterval(() => {
      setOtpCountdown(current => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpStep, otpCountdown]);

  function updateDraft(
    field: 'name' | 'age' | 'gender',
    value: string
  ) {
    setDraftPassenger(current => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSignIn() {
    setOtpStep(false);
    setOtp('');
    setOtpError('');
    setOtpCountdown(0);
    setLoginVisible(true);
  }

  function shakeOtp() {
    otpShake.setValue(0);

    Animated.sequence([
      Animated.timing(otpShake, {
        toValue: 9,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(otpShake, {
        toValue: -9,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(otpShake, {
        toValue: 6,
        duration: 55,
        useNativeDriver: true,
      }),
      Animated.timing(otpShake, {
        toValue: 0,
        duration: 55,
        useNativeDriver: true,
      }),
    ]).start();

    if (Platform.OS !== 'web') {
      Vibration.vibrate(160);
    }
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
    const result = await request<SavedPassenger[]>(
      '/api/v1/users/passengers'
    );

    const list = Array.isArray(result) ? result : [];
    setSavedPassengers(list);

    return list;
  }

  async function handleSendOTP() {
    const number = mobile.trim();

    if (!/^[6-9]\d{9}$/.test(number)) {
      Alert.alert(
        'Invalid mobile number',
        'Enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    try {
      setAuthLoading(true);
      await sendOTP(number);

      setOtpStep(true);
      setOtp('');
      setOtpError('');
      setOtpCountdown(60);
    } catch (error: any) {
      Alert.alert(
        'Unable to send OTP',
        readableApiError(error, 'Please try again.')
      );
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

      await saveTokens({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });

      setIsAuthenticated(true);
      setLoginVisible(false);
      setOtpStep(false);
      setOtp('');

      await refreshSavedPassengers();
    } catch (error: any) {
      const status =
        error?.status ??
        error?.statusCode ??
        error?.response?.status;

      setOtpError(
        status === 401
          ? 'Invalid or expired OTP. Please try again.'
          : readableApiError(
              error,
              'Verification failed. Please try again.'
            )
      );

      setOtp('');
      shakeOtp();
    } finally {
      setAuthLoading(false);
    }
  }

  function isLadiesSeat(seat: any): boolean {
    const value = seat?.ladies_Seat;

    return (
      value === true ||
      value === 1 ||
      ['true', '1', 'yes', 'y'].includes(
        String(value).trim().toLowerCase()
      )
    );
  }

  function isFemalePassenger(gender: string): boolean {
    return ['female', 'f', 'woman'].includes(
      String(gender).trim().toLowerCase()
    );
  }

  function showLadiesSeatError() {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(250);
    }

    Alert.alert(
      'Ladies-only seat',
      'This seat is reserved for female passengers. Please select a female passenger or choose another seat.',
      [{ text: 'Got it' }]
    );
  }

  function nextCompatibleSeat(
    gender: string,
    current: Passenger[] = passengers
  ) {
    const occupied = new Set(current.map(p => p.seatIndex));
    const female = isFemalePassenger(gender);

    return selectedSeats.findIndex((seat, index) => {
      if (occupied.has(index)) return false;
      if (isLadiesSeat(seat) && !female) return false;
      return true;
    });
  }

  function canAssignPassenger(
    gender: string,
    current: Passenger[] = passengers
  ) {
    return nextCompatibleSeat(gender, current) >= 0;
  }

  function beginEditPassenger(saved: SavedPassenger) {
    setEditingPassengerId(saved.passenger_id);
    setEditDraft({
      name: saved.name || '',
      age: String(saved.age ?? ''),
      gender: saved.gender || '',
    });
  }

  function updateEditDraft(
    field: 'name' | 'age' | 'gender',
    value: string
  ) {
    setEditDraft(current => ({
      ...current,
      [field]: value,
    }));
  }

  async function savePassengerEdit(saved: SavedPassenger) {
    const name = editDraft.name.trim();
    const age = Number(editDraft.age);

    if (!name || !editDraft.age || !editDraft.gender) {
      Alert.alert(
        'Passenger details required',
        'Enter name, age and gender.'
      );
      return;
    }

    if (!Number.isInteger(age) || age < 1 || age > 100) {
      Alert.alert('Invalid age', 'Enter an age between 1 and 100.');
      return;
    }

    try {
      setUpdatingPassenger(true);

      await request(
        `/api/v1/users/passengers/${saved.passenger_id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name,
            age,
            gender: editDraft.gender,
          }),
        }
      );

      setSavedPassengers(current =>
        current.map(item =>
          item.passenger_id === saved.passenger_id
            ? {
                ...item,
                name,
                age,
                gender: editDraft.gender,
              }
            : item
        )
      );

      setPassengers(current =>
        current
          .map(item => {
            if (item.passengerId !== saved.passenger_id) {
              return item;
            }

            if (
              isLadiesSeat(selectedSeats[item.seatIndex]) &&
              !isFemalePassenger(editDraft.gender)
            ) {
              return null;
            }

            return {
              ...item,
              name,
              age: String(age),
              gender: editDraft.gender,
            };
          })
          .filter(Boolean) as Passenger[]
      );

      setEditingPassengerId(null);
    } catch (error: any) {
      Alert.alert(
        'Unable to update passenger',
        readableApiError(error, 'Please try again.')
      );
    } finally {
      setUpdatingPassenger(false);
    }
  }

  async function deleteSavedPassenger(saved: SavedPassenger) {
    try {
      setDeletingPassengerId(saved.passenger_id);

      await request(
        `/api/v1/users/passengers/${saved.passenger_id}`,
        {
          method: 'DELETE',
        }
      );

      setSavedPassengers(current =>
        current.filter(
          item => item.passenger_id !== saved.passenger_id
        )
      );

      setPassengers(current =>
        current.filter(
          item => item.passengerId !== saved.passenger_id
        )
      );

      if (editingPassengerId === saved.passenger_id) {
        setEditingPassengerId(null);
      }
    } catch (error: any) {
      Alert.alert(
        'Unable to delete passenger',
        readableApiError(error, 'Please try again.')
      );
    } finally {
      setDeletingPassengerId(null);
    }
  }

  function toggleSavedPassenger(saved: SavedPassenger) {
    const existingIndex = passengers.findIndex(
      p => p.passengerId === saved.passenger_id
    );

    if (existingIndex >= 0) {
      setPassengers(current =>
        current.filter(p => p.passengerId !== saved.passenger_id)
      );
      return;
    }

    const seatIndex = nextCompatibleSeat(saved.gender);

    if (seatIndex < 0) {
      if (!isFemalePassenger(saved.gender)) {
        showLadiesSeatError();
      } else {
        Alert.alert(
          'No seats available',
          'There are no unassigned seats available for this passenger.'
        );
      }
      return;
    }

    setPassengers(current => [
      ...current,
      {
        name: saved.name,
        age: String(saved.age ?? ''),
        gender: saved.gender,
        passengerId: saved.passenger_id,
        seatIndex,
      },
    ]);
  }

  async function saveNewPassenger() {
    const p = draftPassenger;

    if (!p.name.trim() || !p.age || !p.gender) {
      Alert.alert(
        'Passenger details required',
        'Enter name, age and gender.'
      );
      return;
    }

    const age = Number(p.age);

    if (!Number.isInteger(age) || age < 1 || age > 100) {
      Alert.alert('Invalid age', 'Enter an age between 1 and 100.');
      return;
    }

    if (!isAuthenticated) {
      Alert.alert(
        'Sign in required',
        'Sign in before saving a passenger.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: handleSignIn },
        ]
      );
      return;
    }

    try {
      setSavingPassenger(true);

      // Save the passenger independently of seat availability.
      await request('/api/v1/users/passengers', {
        method: 'POST',
        body: JSON.stringify({
          name: p.name.trim(),
          age,
          gender: p.gender,
        }),
      });

      const list = await refreshSavedPassengers();

      const match = list.find(
        item =>
          item.name?.trim().toLowerCase() ===
            p.name.trim().toLowerCase() &&
          Number(item.age) === age &&
          item.gender?.toLowerCase() === p.gender.toLowerCase()
      );

      setDraftPassenger({
        name: '',
        age: '',
        gender: '',
        seatIndex: -1,
      });

      setShowAddPassenger(false);

      if (!match) {
        Alert.alert(
          'Passenger saved',
          'Passenger was saved, but could not be selected automatically. You can select them from the saved passenger list.'
        );
        return;
      }

      const seatIndex = nextCompatibleSeat(match.gender);

      if (seatIndex < 0) {
        Alert.alert(
          'Passenger saved',
          isFemalePassenger(match.gender)
            ? 'Passenger saved successfully. No unassigned seat is available.'
            : 'Passenger saved successfully, but the remaining seats are ladies-only. Select another seat to assign this passenger.'
        );
        return;
      }

      setPassengers(current => [
        ...current,
        {
          name: match.name,
          age: String(match.age),
          gender: match.gender,
          passengerId: match.passenger_id,
          seatIndex,
        },
      ]);

      Alert.alert(
        'Passenger saved',
        `${match.name} has been saved and assigned seat ${seatNames[seatIndex]}.`
      );
    } catch (error: any) {
      Alert.alert(
        'Unable to save passenger',
        readableApiError(error, 'Please try again.')
      );
    } finally {
      setSavingPassenger(false);
    }
  }

  function validateAndContinue() {
    if (!selectedSeats.length) {
      Alert.alert(
        'No seats selected',
        'Please go back and select seats.'
      );
      return;
    }

    if (passengers.length !== selectedSeats.length) {
      Alert.alert(
        'Passenger details incomplete',
        `Select or add passengers for all ${selectedSeats.length} seats. ${selectedSeats.length - passengers.length} seat(s) remain unassigned.`
      );
      return;
    }

    for (const passenger of passengers) {
      if (
        isLadiesSeat(selectedSeats[passenger.seatIndex]) &&
        passenger.gender.toLowerCase() !== 'female'
      ) {
        Alert.alert(
          'Ladies seat restriction',
          'A ladies-only seat can only be assigned to a female passenger.'
        );
        return;
      }
    }

    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      Alert.alert(
        'Invalid mobile number',
        'Please enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    const orderedPassengers = [...passengers].sort(
      (a, b) => a.seatIndex - b.seatIndex
    );

    const passengerPayload = orderedPassengers.map(passenger => ({
      name: passenger.name.trim(),
      age: Number(passenger.age),
      gender: passenger.gender,
      seat: seatNames[passenger.seatIndex],
      seatKey: selectedSeats[passenger.seatIndex]?.seat_Key,
      ...(passenger.passengerId
        ? { passenger_id: passenger.passengerId }
        : {}),
    }));

    const bookingDetails = {
      ...params,
      passengers: passengerPayload,
      contact: {
        mobile: mobile.trim(),
        email: email.trim() || null,
      },
      selectedSeats,
      selectedBoardingPoint: boarding,
      selectedDroppingPoint: dropping,
      totalFare,
    };

    navigation.setParams({
      passengers: passengerPayload,
      contact: bookingDetails.contact,
    });

    Alert.alert(
      'Passenger details completed',
      'Passenger and contact details are ready for the next step.'
    );

    console.log('[StableBus] Passenger details validated:', {
      ...bookingDetails,
      selectedSeats: seatNames,
    });
  }

  const busName =
    bus.operator_Name || bus.travel_Name || 'Selected bus';

  const departureTime = bus.departure_Time || '';
  const arrivalTime = bus.arrival_Time || '';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.bg}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, isWide && styles.wide]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={21} color={C.ink} />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Passenger details</Text>
            <Text style={styles.headerSubtitle}>
              Enter details for each selected seat
            </Text>
          </View>

          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>3 of 4</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            isWide && styles.wide,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tripCard}>
            <View style={styles.tripTop}>
              <View style={styles.busIcon}>
                <Ionicons
                  name="bus-outline"
                  size={22}
                  color={C.burgundy}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.busName}>{busName}</Text>
                <Text style={styles.busType}>
                  {bus.bus_Type || bus.seat_Layout || 'Bus'}
                </Text>
              </View>
            </View>

            <View style={styles.routeRow}>
              <View style={styles.routeStop}>
                <Text style={styles.routeTime}>
                  {departureTime || '--'}
                </Text>
                <Text style={styles.routeCity}>
                  {params.from || 'Departure'}
                </Text>
              </View>

              <View style={styles.routeMiddle}>
                <View style={styles.routeDot} />
                <View style={styles.routeDash} />
                <Ionicons
                  name="bus-outline"
                  size={17}
                  color={C.burgundy}
                />
                <View style={styles.routeDash} />
                <View style={styles.routeDot} />
              </View>

              <View style={[styles.routeStop, { alignItems: 'flex-end' }]}>
                <Text style={styles.routeTime}>
                  {arrivalTime || '--'}
                </Text>
                <Text style={styles.routeCity}>
                  {params.to || 'Destination'}
                </Text>
              </View>
            </View>

            <View style={styles.tripDivider} />

            <View style={styles.tripMeta}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Journey date</Text>
                <Text style={styles.metaValue}>
                  {params.date || 'Selected date'}
                </Text>
              </View>

              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Selected seats</Text>
                <Text style={styles.metaValue}>
                  {seatNames.join(', ') || 'None'}
                </Text>
              </View>
            </View>

            <View style={styles.pointSummary}>
              <View style={styles.pointSummaryItem}>
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={C.burgundy}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointSummaryLabel}>Boarding</Text>
                  <Text style={styles.pointSummaryName}>
                    {getPointName(boarding, 'boarding')}
                  </Text>
                  {!!getPointTime(boarding, 'boarding') && (
                    <Text style={styles.pointSummaryTime}>
                      {formatTime(getPointTime(boarding, 'boarding'))}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.pointSummaryItem}>
                <Ionicons
                  name="flag-outline"
                  size={16}
                  color={C.burgundy}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointSummaryLabel}>Dropping</Text>
                  <Text style={styles.pointSummaryName}>
                    {getPointName(dropping, 'dropping')}
                  </Text>
                  {!!getPointTime(dropping, 'dropping') && (
                    <Text style={styles.pointSummaryTime}>
                      {formatTime(getPointTime(dropping, 'dropping'))}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.headingBlock}>
            <Text style={styles.heading}>Passenger information</Text>
            <Text style={styles.subheading}>
              Select saved passengers or add new passengers.
            </Text>
          </View>

          <View style={styles.signInCard}>
            <View style={styles.signInIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={21}
                color={C.burgundy}
              />
            </View>

            <View style={styles.signInContent}>
              <Text style={styles.signInTitle}>
                {isAuthenticated
                  ? 'You are signed in'
                  : 'Sign in to access saved passengers'}
              </Text>

              <Text style={styles.signInDescription}>
                {isAuthenticated
                  ? `${savedPassengers.length} saved passengers available.`
                  : 'Access your bookings and saved passengers anytime.'}
              </Text>

              {!isAuthenticated && (
                <Pressable
                  onPress={handleSignIn}
                  style={styles.signInLink}
                >
                  <Text style={styles.signInLinkText}>Sign in</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={C.burgundy}
                  />
                </Pressable>
              )}
            </View>
          </View>

          {isAuthenticated && (
            <View style={styles.savedListCard}>
              <Text style={styles.savedListTitle}>Saved passengers</Text>
              <Text style={styles.savedListSubtitle}>
                Select passengers to assign them to available seats.
              </Text>

              {savedPassengers.length === 0 ? (
                <Text style={styles.emptySavedText}>
                  No saved passengers yet. Add one below.
                </Text>
              ) : (
                savedPassengers.map(saved => {
                  const assigned = passengers.find(
                    p => p.passengerId === saved.passenger_id
                  );

                  const selected = !!assigned;

                  const noCompatibleSeat =
                    !selected && !canAssignPassenger(saved.gender);

                  return (
                    <SavedPassengerRow
                      key={saved.passenger_id}
                      passenger={saved}
                      selected={selected}
                      seatName={
                        assigned
                          ? seatNames[assigned.seatIndex]
                          : undefined
                      }
                      disabled={noCompatibleSeat}
                      editing={editingPassengerId === saved.passenger_id}
                      editValue={editDraft}
                      onToggle={() => toggleSavedPassenger(saved)}
                      onEdit={() => beginEditPassenger(saved)}
                      onDelete={() => deleteSavedPassenger(saved)}
                      onEditChange={updateEditDraft}
                      onSaveEdit={() => savePassengerEdit(saved)}
                      onCancelEdit={() => setEditingPassengerId(null)}
                      savingEdit={updatingPassenger}
                    />
                  );
                })
              )}
            </View>
          )}

          <Pressable
            onPress={() => setShowAddPassenger(v => !v)}
            style={styles.addPassengerButton}
          >
            <Ionicons
              name={showAddPassenger ? 'close' : 'add-circle-outline'}
              size={18}
              color={C.burgundy}
            />
            <Text style={styles.addPassengerButtonText}>
              {showAddPassenger ? 'Close passenger form' : 'Add passenger'}
            </Text>
          </Pressable>

          {showAddPassenger && (
            <PassengerForm
              value={draftPassenger}
              onChange={updateDraft}
              onSave={saveNewPassenger}
              onCancel={() => setShowAddPassenger(false)}
              saving={savingPassenger}
            />
          )}

          <View style={styles.contactCard}>
            <View style={styles.contactHeading}>
              <View style={styles.contactIcon}>
                <Ionicons
                  name="call-outline"
                  size={19}
                  color={C.burgundy}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.contactTitle}>Contact details</Text>
                <Text style={styles.contactSubtitle}>
                  Booking updates will be sent here
                </Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Mobile number <Text style={styles.required}>*</Text>
              </Text>

              <View style={styles.phoneInput}>
                <Text style={styles.countryCode}>+91</Text>
                <View style={styles.phoneDivider} />
                <TextInput
                  value={mobile}
                  onChangeText={value =>
                    setMobile(value.replace(/[^0-9]/g, '').slice(0, 10))
                  }
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#A99D95"
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={styles.phoneTextInput}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#A99D95"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.optionalText}>Optional</Text>
            </View>
          </View>

          <View style={styles.notice}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={C.green}
            />
            <Text style={styles.noticeText}>
              Check passenger names and ages carefully before proceeding.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={styles.fareInfo}>
            <Text style={styles.fareLabel}>Total seat fare</Text>
            <Text style={styles.fareValue}>{formatFare(totalFare)}</Text>
            <Text style={styles.fareSeats}>
              {selectedSeats.length}{' '}
              {selectedSeats.length === 1 ? 'seat' : 'seats'}
            </Text>
          </View>

          <Pressable
            onPress={validateAndContinue}
            style={styles.continueButton}
          >
            <Text style={styles.continueText}>Continue</Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={C.white}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={loginVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setLoginVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setLoginVisible(false)}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKeyboard}
          >
            <View style={styles.loginSheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>
                    {otpStep ? 'Verify your number' : 'Sign in to StableBus'}
                  </Text>

                  <Text style={styles.sheetSubtitle}>
                    {otpStep
                      ? `Enter the OTP sent to +91 ${mobile}`
                      : 'Access your bookings and saved passengers'}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setLoginVisible(false)}
                  style={styles.sheetClose}
                >
                  <Ionicons name="close" size={21} color={C.ink} />
                </Pressable>
              </View>

              {!otpStep ? (
                <>
                  <Text style={styles.sheetLabel}>Mobile number</Text>

                  <View style={styles.sheetPhoneInput}>
                    <Text style={styles.countryCode}>+91</Text>
                    <View style={styles.phoneDivider} />

                    <TextInput
                      value={mobile}
                      onChangeText={value =>
                        setMobile(value.replace(/[^0-9]/g, '').slice(0, 10))
                      }
                      placeholder="10-digit mobile number"
                      placeholderTextColor="#A99D95"
                      keyboardType="phone-pad"
                      maxLength={10}
                      autoFocus
                      style={styles.sheetPhoneText}
                    />
                  </View>

                  <Pressable
                    onPress={handleSendOTP}
                    disabled={authLoading}
                    style={[
                      styles.sheetPrimaryButton,
                      authLoading && styles.buttonDisabled,
                    ]}
                  >
                    {authLoading ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <Text style={styles.sheetPrimaryText}>Continue</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sheetLabel}>6-digit OTP</Text>

                  <Pressable
                    onPress={() => otpInputRef.current?.focus()}
                    style={{ width: '100%' }}
                  >
                    <Animated.View
                      style={[
                        styles.otpBoxesRow,
                        { transform: [{ translateX: otpShake }] },
                      ]}
                    >
                      {Array.from({ length: 6 }).map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.otpBox,
                            otp.length === index &&
                              !otpError &&
                              styles.otpBoxActive,
                            !!otpError && styles.otpBoxError,
                          ]}
                        >
                          <Text style={styles.otpDigit}>
                            {otp[index] || ''}
                          </Text>
                        </View>
                      ))}
                    </Animated.View>

                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={value => {
                        setOtp(value.replace(/[^0-9]/g, '').slice(0, 6));
                        setOtpError('');
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      caretHidden
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      style={styles.hiddenOtpInput}
                    />
                  </Pressable>

                  {!!otpError && (
                    <Text style={styles.otpErrorText}>{otpError}</Text>
                  )}

                  <Pressable
                    onPress={handleVerifyOTP}
                    disabled={authLoading}
                    style={[
                      styles.sheetPrimaryButton,
                      authLoading && styles.buttonDisabled,
                    ]}
                  >
                    {authLoading ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <Text style={styles.sheetPrimaryText}>
                        Verify & sign in
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.otpActions}>
                    <Pressable
                      onPress={() => {
                        setOtpStep(false);
                        setOtp('');
                        setOtpError('');
                      }}
                    >
                      <Text style={styles.sheetTextAction}>
                        Change number
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={otpCountdown > 0 || authLoading}
                      onPress={handleSendOTP}
                    >
                      <Text
                        style={[
                          styles.sheetTextAction,
                          otpCountdown > 0 && styles.disabledAction,
                        ]}
                      >
                        {otpCountdown > 0
                          ? `Resend OTP in ${otpCountdown}s`
                          : 'Resend OTP'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              <Text style={styles.sheetFootnote}>
                By continuing, you agree to receive booking-related updates from StableBus.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  wide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 13,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },
  stepBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.burgundyLight,
  },
  stepText: {
    color: C.burgundy,
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  tripCard: {
    backgroundColor: C.paper,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 23,
  },
  tripTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  busName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  busType: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 21,
  },
  routeStop: {
    flex: 1,
  },
  routeTime: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  routeCity: {
    color: C.muted,
    fontSize: 11,
    marginTop: 5,
  },
  routeMiddle: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.burgundy,
  },
  routeDash: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  tripDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 15,
  },
  tripMeta: {
    flexDirection: 'row',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    color: C.muted,
    fontSize: 10,
  },
  metaValue: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  pointSummary: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 15,
    paddingTop: 14,
    gap: 13,
  },
  pointSummaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  pointSummaryLabel: {
    color: C.muted,
    fontSize: 10,
  },
  pointSummaryName: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  pointSummaryTime: {
    color: C.burgundy,
    fontSize: 11,
    marginTop: 3,
  },
  headingBlock: {
    marginBottom: 14,
  },
  heading: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  subheading: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },
  signInCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
  },
  signInIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  signInContent: {
    flex: 1,
  },
  signInTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  signInDescription: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  signInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 10,
    paddingVertical: 2,
  },
  signInLinkText: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '700',
  },
  savedListCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  savedListTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  savedListSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
  },
  emptySavedText: {
    color: C.muted,
    fontSize: 11,
    paddingVertical: 10,
  },
  savedRowWrap: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  savedRowWrapSelected: {
    borderWidth: 1,
    borderColor: C.green,
    backgroundColor: '#F5FAF6',
    marginVertical: 3,
  },
  savedRowWrapDisabled: {
    opacity: 0.48,
  },
  savedRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  savedRowSelect: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 5,
  },
  rowAction: {
    width: 27,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledSavedText: {
    color: '#9B928D',
  },
  checkboxDisabled: {
    backgroundColor: '#F0ECE8',
    borderColor: '#D9D1CB',
  },
  inlineEditPanel: {
    paddingTop: 9,
    paddingBottom: 8,
    paddingHorizontal: 2,
    gap: 8,
  },
  inlineEditInput: {
    height: 39,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    paddingHorizontal: 10,
    color: C.ink,
    fontSize: 12,
  },
  inlineAgeInput: {
    width: 92,
  },
  inlineGenderRow: {
    flexDirection: 'row',
    gap: 7,
  },
  inlineGenderOption: {
    minHeight: 34,
  },
  inlineEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  checkbox: {
    width: 21,
    height: 21,
    borderWidth: 1.4,
    borderColor: C.border,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: C.burgundy,
    borderColor: C.burgundy,
  },
  savedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedAvatarText: {
    color: C.burgundy,
    fontWeight: '800',
    fontSize: 13,
  },
  savedInfo: {
    flex: 1,
  },
  savedName: {
    color: C.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  savedMeta: {
    color: C.muted,
    fontSize: 10,
    marginTop: 3,
  },
  assignedSeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.burgundyLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  assignedSeatText: {
    color: C.green,
    fontSize: 10,
    fontWeight: '700',
  },
  addPassengerButton: {
    minHeight: 43,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.burgundy,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 12,
    backgroundColor: C.burgundyLight,
  },
  addPassengerButtonText: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '800',
  },
  passengerCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  passengerTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 13,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  required: {
    color: C.error,
  },
  input: {
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.input,
    paddingHorizontal: 12,
    color: C.ink,
    fontSize: 13,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 11,
    backgroundColor: C.white,
  },
  genderOptionSelected: {
    borderColor: C.burgundy,
    backgroundColor: C.burgundyLight,
  },
  genderText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  genderTextSelected: {
    color: C.burgundy,
    fontWeight: '700',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 8,
  },
  cancelPassengerButton: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.bg,
  },
  cancelPassengerText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  savePassengerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.burgundy,
  },
  savePassengerButtonText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '700',
  },
  contactCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 16,
    marginTop: 3,
  },
  contactHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  contactIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contactTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  contactSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  phoneInput: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.input,
    paddingHorizontal: 13,
  },
  countryCode: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  phoneDivider: {
    height: 23,
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 12,
  },
  phoneTextInput: {
    flex: 1,
    height: 48,
    color: C.ink,
    fontSize: 13,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  optionalText: {
    color: C.muted,
    fontSize: 10,
    marginTop: 5,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 13,
    borderRadius: 13,
    backgroundColor: '#EDF4EE',
    marginTop: 15,
  },
  noticeText: {
    flex: 1,
    color: C.ink,
    fontSize: 11,
    lineHeight: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    paddingBottom: 16,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  fareInfo: {
    flex: 1,
  },
  fareLabel: {
    color: C.muted,
    fontSize: 11,
  },
  fareValue: {
    color: C.ink,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 3,
  },
  fareSeats: {
    color: C.muted,
    fontSize: 10,
    marginTop: 2,
  },
  continueButton: {
    minWidth: 150,
    height: 49,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(35, 25, 23, 0.32)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetKeyboard: {
    justifyContent: 'flex-end',
  },
  loginSheet: {
    minHeight: 350,
    maxHeight: '58%',
    backgroundColor: C.paper,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 25,
  },
  sheetTitle: {
    color: C.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
  },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLabel: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 9,
  },
  sheetPhoneInput: {
    height: 52,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: C.white,
  },
  sheetPhoneText: {
    flex: 1,
    height: 52,
    color: C.ink,
    fontSize: 15,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 7,
    width: '100%',
  },
  otpBox: {
    flex: 1,
    height: 51,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: C.burgundy,
    borderWidth: 1.5,
    backgroundColor: C.burgundyLight,
  },
  otpBoxError: {
    borderColor: C.error,
    backgroundColor: '#FFF1F0',
    borderWidth: 1.5,
  },
  otpDigit: {
    color: C.ink,
    fontSize: 21,
    fontWeight: '700',
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: 0,
    top: 0,
  },
  otpErrorText: {
    color: C.error,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 7,
  },
  sheetPrimaryButton: {
    height: 51,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  sheetPrimaryText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
  otpActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  sheetTextAction: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledAction: {
    color: C.muted,
  },
  sheetFootnote: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 22,
    textAlign: 'center',
  },
  continueText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
});