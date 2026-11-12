
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
  green: '#47765B',
  greenLight: '#EDF4EE',
  unavailable: '#E8E4E0',
  white: '#FFFFFF',

  // Ladies seat colors
  ladies: '#FCEAF1',
  ladiesBorder: '#E8B8C9',
  ladiesInk: '#A65372',

  // Booked ladies seat colors
ladiesBooked: '#EADDE2',
ladiesBookedBorder: '#D9C3CC',
ladiesBookedInk: '#987986',
};

const GRID_GAP = 3;
const GRID_PADDING = 4;
const MIN_SEAT_HEIGHT = 46;

type Seat = {
  seat_Number?: string;
  seat_Key?: string;
  row?: string | number;
  column?: string | number;
  length?: string | number;
  width?: string | number;
  zIndex?: string | number;
  bookable?: boolean | string | number;
  ladies_Seat?: boolean | string | number;
  fareMaster?: {
    total_Amount?: string | number;
    basic_Amount?: string | number;
  };
  [key: string]: any;
};

type Point = {
  [key: string]: any;
};

function firstValue(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function numberValue(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isTrue(value: any): boolean {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === 'true' ||
    String(value) === '1'
  );
}

function pointId(point: Point): string {
  const value = firstValue(point, [
    'boarding_Id',
    'boarding_ID',
    'boardingId',
    'dropping_Id',
    'dropping_ID',
    'droppingId',
    'point_Id',
    'point_ID',
    'pointId',
    'id',
  ]);

  return value === undefined ? '' : String(value);
}

function extractSeatMap(response: any): Seat[] {
  const candidates = [
    response?.seatMap,
    response?.data?.seatMap,
    response?.response?.seatMap,
    response?.data?.data?.seatMap,
  ];

  return candidates.find(Array.isArray) || [];
}

function seatFare(seat: Seat): number {
  return numberValue(
    firstValue(seat.fareMaster, ['total_Amount', 'basic_Amount'])
  );
}

function formatFare(seat: Seat): string {
  const fare = seatFare(seat);

  return fare > 0
    ? `₹${fare.toLocaleString('en-IN', {
        maximumFractionDigits: 0,
      })}`
    : '';
}

function seatKey(seat: Seat, index: number): string {
  return String(seat.seat_Key || seat.seat_Number || index);
}

/* =====================================================
   SEAT TILE
===================================================== */

function SeatTile({
  seat,
  selected,
  width,
  height,
  onPress,
}: {
  seat: Seat;
  selected: boolean;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const bookable = isTrue(seat.bookable);
  const ladies = isTrue(seat.ladies_Seat);

  const background = selected
    ? C.burgundy
    : ladies && !bookable
      ? C.ladiesBooked
      : !bookable
        ? C.unavailable
        : ladies
          ? C.ladies
          : C.greenLight;

  const borderColor = selected
    ? C.burgundy
    : ladies && !bookable
      ? C.ladiesBookedBorder
      : !bookable
        ? '#D7D1CB'
        : ladies
          ? C.ladiesBorder
          : '#BDD2C1';

  const textColor = selected
    ? C.white
    : ladies && !bookable
      ? C.ladiesBookedInk
      : !bookable
        ? '#938B85'
        : ladies
          ? C.ladiesInk
          : C.green;

  const compact = width < 55;
  const showIcon = width >= 48;

  return (
    <Pressable
      disabled={!bookable}
      onPress={onPress}
      style={[
        styles.seatTile,
        {
          width,
          height,
          backgroundColor: background,
          borderColor,
          paddingHorizontal: compact ? 1 : 3,
        },
      ]}
    >
      {showIcon && (
        <Ionicons
          name={
            numberValue(seat.length, 1) > 1
              ? 'bed-outline'
              : 'person-outline'
          }
          size={compact ? 12 : 15}
          color={textColor}
        />
      )}

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[
          styles.seatNumber,
          {
            color: textColor,
            fontSize: compact ? 11 : 13,
          },
        ]}
      >
        {seat.seat_Number || 'Seat'}
      </Text>

      {!!formatFare(seat) && (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[
            styles.seatFare,
            {
              color: textColor,
              fontSize: compact ? 10 : 11,
            },
          ]}
        >
          {formatFare(seat)}
        </Text>
      )}
    </Pressable>
  );
}

/* =====================================================
   DECK
   Horizontal position = API row (mirrored correction)
   Vertical position   = API column
   Horizontal span     = API width
   Vertical span       = API length
===================================================== */

function Deck({
  title,
  seats,
  selectedKeys,
  onToggle,
  deckWidth,
}: {
  title: string;
  seats: Seat[];
  selectedKeys: string[];
  onToggle: (seat: Seat) => void;
  deckWidth: number;
}) {
  if (!seats.length) return null;

  const positionedSeats = seats.map((seat, index) => ({
    seat,
    key: seatKey(seat, index),
    row: numberValue(seat.row),
    column: numberValue(seat.column),
    length: Math.max(1, numberValue(seat.length, 1)),
    width: Math.max(1, numberValue(seat.width, 1)),
  }));

  const minX = Math.min(...positionedSeats.map(s => s.row));

  const maxX = Math.max(
    ...positionedSeats.map(s => s.row + s.width - 1)
  );

  const minY = Math.min(...positionedSeats.map(s => s.column));

  const maxY = Math.max(
    ...positionedSeats.map(s => s.column + s.length - 1)
  );

  const horizontalCells = maxX - minX + 1;
  const verticalCells = maxY - minY + 1;

  const innerWidth = Math.max(20, deckWidth - GRID_PADDING * 2);

  const cellWidth =
    (innerWidth - (horizontalCells - 1) * GRID_GAP) /
    horizontalCells;

  const cellHeight = MIN_SEAT_HEIGHT;

  const gridWidth =
    horizontalCells * cellWidth +
    (horizontalCells - 1) * GRID_GAP;

  const gridHeight =
    verticalCells * cellHeight +
    (verticalCells - 1) * GRID_GAP;

  return (
    <View style={[styles.deckCard, { width: deckWidth }]}>
      <View style={styles.deckHeader}>
        <View style={styles.deckIcon}>
          <Ionicons
            name="grid-outline"
            size={16}
            color={C.burgundy}
          />
        </View>

        <View style={styles.deckHeaderText}>
          <Text style={styles.deckTitle} numberOfLines={1}>
            {title}
          </Text>

          <Text style={styles.deckCount}>
            {seats.length} seats
          </Text>
        </View>
      </View>

      <View style={styles.deckBody}>
        <View
          style={{
            width: gridWidth,
            height: gridHeight,
            position: 'relative',
          }}
        >
          {positionedSeats.map(item => {
            // Preserve existing provider coordinate correction.
            const left =
              (maxX - (item.row + item.width - 1)) *
              (cellWidth + GRID_GAP);

            const top =
              (item.column - minY) *
              (cellHeight + GRID_GAP);

            const tileWidth =
              item.width * cellWidth +
              (item.width - 1) * GRID_GAP;

            const tileHeight =
              item.length * cellHeight +
              (item.length - 1) * GRID_GAP;

            return (
              <View
                key={item.key}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  zIndex: numberValue(item.seat.zIndex),
                }}
              >
                <SeatTile
                  seat={item.seat}
                  selected={selectedKeys.includes(item.key)}
                  width={tileWidth}
                  height={tileHeight}
                  onPress={() => onToggle(item.seat)}
                />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* =====================================================
   LEGEND
===================================================== */

function Legend({
  color,
  border,
  label,
}: {
  color: string;
  border: string;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          {
            backgroundColor: color,
            borderColor: border,
          },
        ]}
      />

      <Text style={styles.legendText}>
        {label}
      </Text>
    </View>
  );
}

/* =====================================================
   MAIN SCREEN
===================================================== */

export default function Seats({ navigation, route }: any) {
  const { width: screenWidth } = useWindowDimensions();

  const isMobile = screenWidth < 640;
  const params = route?.params || {};
  const bus = params.bus || {};

  const boardingPoints: Point[] = Array.isArray(params.boardingDetails)
    ? params.boardingDetails
    : [];

  const droppingPoints: Point[] = Array.isArray(params.droppingDetails)
    ? params.droppingDetails
    : [];

  const defaultBoarding =
    params.defaultBoarding || boardingPoints[0] || null;

  const defaultDropping =
    params.defaultDropping || droppingPoints[0] || null;

  const [seatResponse, setSeatResponse] = useState<any>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lowerDeck = useMemo(
    () => seats.filter(seat => numberValue(seat.zIndex) === 0),
    [seats]
  );

  const upperDeck = useMemo(
    () => seats.filter(seat => numberValue(seat.zIndex) === 1),
    [seats]
  );

  const otherDecks = useMemo(
    () =>
      [
        ...new Set(
          seats
            .map(seat => numberValue(seat.zIndex))
            .filter(value => value !== 0 && value !== 1)
        ),
      ].sort((a, b) => a - b),
    [seats]
  );

  const selectedSeats = useMemo(
    () =>
      seats.filter((seat, index) =>
        selectedKeys.includes(seatKey(seat, index))
      ),
    [seats, selectedKeys]
  );

  const totalFare = selectedSeats.reduce(
    (sum, seat) => sum + seatFare(seat),
    0
  );

  /*
   * Calculate actual deck width from available screen width.
   * Preserve responsive two-deck layout.
   */
  const maxContentWidth = Math.min(screenWidth, 760);
  const outerPadding = 10;
  const sectionPadding = 8;
  const deckGap = 6;

  const availableDeckSpace = Math.max(
    100,
    maxContentWidth -
      outerPadding * 2 -
      sectionPadding * 2 -
      deckGap
  );

  const deckWidth = availableDeckSpace / 2;
  const sectionInnerWidth = availableDeckSpace + deckGap;

  useEffect(() => {
    if (defaultBoarding && defaultDropping) {
      loadSeatMap(defaultBoarding, defaultDropping);
    } else {
      setError(
        'Boarding or dropping point information is missing.'
      );
    }
  }, []);

  async function loadSeatMap(
    boardingPoint: Point,
    droppingPoint: Point
  ) {
    const busKey = params.busKey || bus.bus_Key;
    const searchKey = params.searchKey || bus.search_Key;

    const boardingId = pointId(boardingPoint);
    const droppingId = pointId(droppingPoint);

    if (!busKey || !searchKey || !boardingId || !droppingId) {
      setError(
        'Required bus or journey point information is missing.'
      );
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSeats([]);
      setSelectedKeys([]);
      setSeatResponse(null);

      const response = await searchApi.seatMap({
        bus_key: String(busKey),
        search_key: String(searchKey),
        boarding_id: boardingId,
        dropping_id: droppingId,
      });

      const seatList = extractSeatMap(response);

      if (!seatList.length) {
        throw new Error(
         (response?.response_Header as { error_Desc?: string } | undefined)?.error_Desc ||
          'The provider returned no seat information.'
        );
      }

      setSeatResponse(response);
      setSeats(seatList);
    } catch (err: any) {
      console.error(
        '[StableBus] Seat map request failed:',
        err
      );

      setError(
        err?.message ||
        'Unable to load seats. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleSeat(seat: Seat) {
    if (!isTrue(seat.bookable)) return;

    const key = seat.seat_Key || seat.seat_Number;

    if (!key) return;

    setSelectedKeys(current =>
      current.includes(String(key))
        ? current.filter(item => item !== String(key))
        : [...current, String(key)]
    );
  }

  function continueToBoarding() {
    if (!selectedSeats.length) {
      Alert.alert(
        'Select seats',
        'Please select at least one seat.'
      );
      return;
    }

    navigation.navigate('points', {
      bus,
      busKey: params.busKey || bus.bus_Key,
      searchKey: params.searchKey || bus.search_Key,
      from: params.from,
      to: params.to,
      date: params.date,
      boardingDetails: boardingPoints,
      droppingDetails: droppingPoints,
      defaultBoarding,
      defaultDropping,
      selectedSeats,
      selectedSeatKeys: selectedSeats.map(
        seat => seat.seat_Key
      ),
      totalFare,
      seatResponse,
      dropPointMandatory: params.dropPointMandatory,
    });
  }

  const busName =
    bus.operator_Name ||
    bus.travel_Name ||
    'Selected bus';

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.bg}
      />

      <View style={[styles.header, !isMobile && styles.wide]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={20}
            color={C.ink}
          />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            Select your seats
          </Text>

          <Text style={styles.headerSubtitle}>
            {params.from || 'Departure'} → {params.to || 'Destination'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          !isMobile && styles.wide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.busCard}>
          <View style={styles.busIcon}>
            <Ionicons
              name="bus-outline"
              size={22}
              color={C.burgundy}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.busName}>
              {busName}
            </Text>

            <Text style={styles.busType}>
              {bus.bus_Type || bus.seat_Layout || 'Bus'}
            </Text>

            <Text style={styles.busRoute}>
              {bus.departure_Time || ''} → {bus.arrival_Time || ''}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.seatHeading}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Choose your seats
              </Text>

              <Text style={styles.sectionSubtitle}>
                Select available seats from either deck
              </Text>
            </View>

            {!!seats.length && (
              <Text style={styles.seatCount}>
                {seats.length} seats
              </Text>
            )}
          </View>

          <View style={styles.legend}>
            <Legend
              color={C.greenLight}
              border="#BDD2C1"
              label="Available"
            />

            <Legend
              color={C.unavailable}
              border="#D7D1CB"
              label="Booked"
            />

            <Legend
              color={C.burgundy}
              border={C.burgundy}
              label="Selected"
            />

            <Legend
              color={C.ladies}
              border={C.ladiesBorder}
              label="Ladies only"
            />

            <Legend
              color={C.ladiesBooked}
              border={C.ladiesBookedBorder}
              label="Booked ladies"
            />
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator
                size="large"
                color={C.burgundy}
              />

              <Text style={styles.loadingText}>
                Loading seat layout...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={26}
                color={C.burgundy}
              />

              <Text style={styles.errorText}>
                {error}
              </Text>

              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  if (defaultBoarding && defaultDropping) {
                    loadSeatMap(
                      defaultBoarding,
                      defaultDropping
                    );
                  }
                }}
              >
                <Text style={styles.retryText}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : !seats.length ? (
            <View style={styles.emptyCard}>
              <Ionicons
                name="grid-outline"
                size={28}
                color={C.muted}
              />

              <Text style={styles.emptyTitle}>
                No seats available
              </Text>

              <Text style={styles.emptyText}>
                Seat information is not available for this bus.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.decksRow}>
                {lowerDeck.length > 0 && (
                  <Deck
                    title="Lower deck"
                    seats={lowerDeck}
                    selectedKeys={selectedKeys}
                    onToggle={toggleSeat}
                    deckWidth={
                      upperDeck.length
                        ? deckWidth
                        : sectionInnerWidth
                    }
                  />
                )}

                {upperDeck.length > 0 && (
                  <Deck
                    title="Upper deck"
                    seats={upperDeck}
                    selectedKeys={selectedKeys}
                    onToggle={toggleSeat}
                    deckWidth={
                      lowerDeck.length
                        ? deckWidth
                        : sectionInnerWidth
                    }
                  />
                )}
              </View>

              {otherDecks.map(deck => (
                <View
                  key={deck}
                  style={styles.otherDeck}
                >
                  <Deck
                    title={`Deck ${deck}`}
                    seats={seats.filter(
                      seat => numberValue(seat.zIndex) === deck
                    )}
                    selectedKeys={selectedKeys}
                    onToggle={toggleSeat}
                    deckWidth={sectionInnerWidth}
                  />
                </View>
              ))}

              <Text style={styles.layoutNote}>
                Seat positions follow the bus operator's exact coordinates.
              </Text>
            </>
          )}
        </View>

        {selectedSeats.length > 0 && (
          <View style={styles.selectionCard}>
            <View style={styles.selectionTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectionTitle}>
                  {selectedSeats.length} seat
                  {selectedSeats.length > 1 ? 's' : ''} selected
                </Text>

                <Text style={styles.selectionNames}>
                  {selectedSeats
                    .map(seat => seat.seat_Number || 'Seat')
                    .join(', ')}
                </Text>
              </View>

              <View style={styles.selectionPrice}>
                <Text style={styles.totalLabel}>
                  Total fare
                </Text>

                <Text style={styles.totalAmount}>
                  ₹{totalFare.toLocaleString('en-IN', {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.continueButton}
              onPress={continueToBoarding}
            >
              <Text style={styles.continueText}>
                Continue
              </Text>

              <Ionicons
                name="arrow-forward"
                size={18}
                color={C.white}
              />
            </Pressable>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

/* =====================================================
   STYLES
===================================================== */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.paper,
  },

  wide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  headerText: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: C.ink,
  },

  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: C.muted,
  },

  scroll: {
    flex: 1,
  },

  content: {
    width: '100%',
    padding: 10,
    gap: 12,
  },

  busCard: {
    backgroundColor: C.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  busIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  busName: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
  },

  busType: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },

  busRoute: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },

  section: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 8,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
    lineHeight: 18,
  },

  seatHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  seatCount: {
    color: C.burgundy,
    fontSize: 12,
    fontWeight: '800',
  },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 1,
  },

  legendText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '600',
  },

  decksRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },

  deckCard: {
    flexShrink: 0,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FBF9F5',
    overflow: 'hidden',
  },

  deckHeader: {
    minHeight: 48,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  deckIcon: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deckHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  deckTitle: {
    color: C.ink,
    fontSize: 10,
    fontWeight: '800',
  },

  deckCount: {
    color: C.muted,
    fontSize: 9,
    marginTop: 2,
  },

  deckBody: {
    padding: GRID_PADDING,
    alignItems: 'center',
  },

  seatTile: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
    overflow: 'hidden',
  },

  seatNumber: {
    fontWeight: '800',
    textAlign: 'center',
    maxWidth: '100%',
    flexShrink: 1,
  },

  seatFare: {
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: '100%',
    flexShrink: 1,
  },

  otherDeck: {
    marginTop: 12,
  },

  loadingCard: {
    minHeight: 170,
    borderRadius: 15,
    backgroundColor: '#FBF9F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loadingText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '600',
  },

  errorCard: {
    minHeight: 170,
    borderRadius: 15,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },

  errorText: {
    color: C.ink,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },

  retryButton: {
    backgroundColor: C.burgundy,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },

  retryText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },

  emptyCard: {
    minHeight: 160,
    borderRadius: 15,
    backgroundColor: '#FBF9F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },

  emptyTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  emptyText: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  layoutNote: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 10,
  },

  selectionCard: {
    backgroundColor: C.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    gap: 14,
  },

  selectionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  selectionTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  selectionNames: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },

  selectionPrice: {
    alignItems: 'flex-end',
  },

  totalLabel: {
    color: C.muted,
    fontSize: 11,
  },

  totalAmount: {
    color: C.ink,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3,
  },

  continueButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: C.burgundy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },

  continueText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
