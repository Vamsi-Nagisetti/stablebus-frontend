import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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

function PassengerCard({
  index,
  seatName,
  passenger,
  onChange,
}: {
  index: number;
  seatName: string;
  passenger: Passenger;
  onChange: (field: keyof Passenger, value: string) => void;
}) {
  return (
    <View style={styles.passengerCard}>
      <View style={styles.passengerHeading}>
        <View style={styles.passengerNumber}>
          <Text style={styles.passengerNumberText}>{index + 1}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.passengerTitle}>
            Passenger {index + 1}
          </Text>
          <Text style={styles.passengerSeat}>
            Seat {seatName}
          </Text>
        </View>

        <View style={styles.seatTag}>
          <Ionicons name="ticket-outline" size={13} color={C.burgundy} />
          <Text style={styles.seatTagText}>{seatName}</Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={passenger.name}
          onChangeText={value => onChange('name', value)}
          placeholder="Enter passenger's full name"
          placeholderTextColor="#A99D95"
          autoCapitalize="words"
          autoCorrect={false}
          style={styles.input}
          returnKeyType="next"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Age</Text>
        <TextInput
          value={passenger.age}
          onChangeText={value =>
            onChange('age', value.replace(/[^0-9]/g, '').slice(0, 3))
          }
          placeholder="Enter age"
          placeholderTextColor="#A99D95"
          keyboardType="number-pad"
          style={styles.input}
          maxLength={3}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Gender</Text>

        <View style={styles.genderRow}>
          {['Male', 'Female', 'Other'].map(gender => {
            const selected = passenger.gender === gender;

            return (
              <Pressable
                key={gender}
                onPress={() => onChange('gender', gender)}
                style={[
                  styles.genderOption,
                  selected && styles.genderOptionSelected,
                  selected && gender === 'Female' && styles.femaleGenderSelected,
                ]}
              >
                {selected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={gender === 'Female' ? '#A65372' : C.burgundy}
                  />
                )}
                <Text
                  style={[
                    styles.genderText,
                    selected && styles.genderTextSelected,
                    selected && gender === 'Female' && styles.femaleGenderText,
                  ]}
                >
                  {gender}
                </Text>
              </Pressable>
            );
          })}
        </View>
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

  const [passengers, setPassengers] = useState<Passenger[]>(
    () =>
      selectedSeats.map(() => ({
        name: '',
        age: '',
        gender: '',
      }))
  );

  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  function updatePassenger(
    index: number,
    field: keyof Passenger,
    value: string
  ) {
    setPassengers(current =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? { ...passenger, [field]: value }
          : passenger
      )
    );
  }

  function handleSignIn() {
    Alert.alert(
      'Sign in',
      'Sign-in will be available here soon. You can continue your booking as a guest for now.'
    );
  }

  function validateAndContinue() {
    if (!selectedSeats.length) {
      Alert.alert(
        'No seats selected',
        'Please go back and select at least one seat.'
      );
      return;
    }

    for (let i = 0; i < passengers.length; i++) {
      const passenger = passengers[i];

      if (!passenger.name.trim()) {
        Alert.alert(
          'Passenger name required',
          `Please enter the name for passenger ${i + 1}.`
        );
        return;
      }

      const age = Number(passenger.age);

      if (!passenger.age || !Number.isInteger(age) || age < 1 || age > 100) {
        Alert.alert(
          'Invalid age',
          `Please enter a valid age between 1 and 100 for passenger ${i + 1}.`
        );
        return;
      }

      if (!passenger.gender) {
        Alert.alert(
          'Select gender',
          `Please select the gender for passenger ${i + 1}.`
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
      Alert.alert(
        'Invalid email',
        'Please enter a valid email address.'
      );
      return;
    }

    const passengerPayload = passengers.map((passenger, index) => ({
      name: passenger.name.trim(),
      age: Number(passenger.age),
      gender: passenger.gender,
      seat: seatNames[index],
      seatKey: selectedSeats[index]?.seat_Key,
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
      'All passenger and contact details have been validated. The next step is payment integration.'
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
                <Text style={styles.routeTime}>{departureTime || '--'}</Text>
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
                <Text style={styles.routeTime}>{arrivalTime || '--'}</Text>
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
              Please enter the details exactly as required for travel.
            </Text>
          </View>

          {/* Sign-in prompt for guest users */}
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
                Don't lose track of your bookings
              </Text>

              <Text style={styles.signInDescription}>
               Sign in to access your bookings, cancellations and trip details anytime.
              </Text>

              <Pressable
                onPress={handleSignIn}
                hitSlop={8}
                style={styles.signInLink}
              >
                <Text style={styles.signInLinkText}>Sign in</Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={C.burgundy}
                />
              </Pressable>
            </View>
          </View>

          {passengers.map((passenger, index) => (
            <PassengerCard
              key={`${seatNames[index]}-${index}`}
              index={index}
              seatName={seatNames[index]}
              passenger={passenger}
              onChange={(field, value) =>
                updatePassenger(index, field, value)
              }
            />
          ))}

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
              {selectedSeats.length} {selectedSeats.length === 1 ? 'seat' : 'seats'}
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
  passengerCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  passengerHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  passengerNumber: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  passengerNumberText: {
    color: C.burgundy,
    fontSize: 14,
    fontWeight: '800',
  },
  passengerTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  passengerSeat: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  seatTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.burgundyLight,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  seatTagText: {
    color: C.burgundy,
    fontSize: 11,
    fontWeight: '700',
  },
  field: {
    marginBottom: 15,
  },
  label: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  required: {
    color: C.error,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.input,
    paddingHorizontal: 13,
    color: C.ink,
    fontSize: 13,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 11,
    backgroundColor: C.white,
  },
  genderOptionSelected: {
    borderColor: C.burgundy,
    backgroundColor: C.burgundyLight,
  },
  femaleGenderSelected: {
    borderColor: '#E8A9C1',
    backgroundColor: '#FCE7EF',
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
  femaleGenderText: {
    color: '#A65372',
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
  },
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
  continueText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
});