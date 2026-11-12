import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Point = {
  [key: string]: any;
};

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
};

function pointId(point: Point, type: 'boarding' | 'dropping'): string {
  const prefix = type === 'boarding' ? 'boarding' : 'dropping';

  const value =
    point?.[`${prefix}_Id`] ??
    point?.[`${prefix}_ID`] ??
    point?.[`${prefix}Id`] ??
    point?.point_Id ??
    point?.point_ID ??
    point?.pointId ??
    point?.id;

  return value == null ? '' : String(value);
}

function pointName(point: Point, type: 'boarding' | 'dropping'): string {
  const prefix = type === 'boarding' ? 'boarding' : 'dropping';

  return String(
    point?.[`${prefix}_Name`] ??
    point?.[`${prefix}Name`] ??
    point?.point_Name ??
    point?.pointName ??
    point?.name ??
    point?.[`${prefix}_Address`] ??
    'Location'
  );
}

function cleanPointText(value: any): string {
  if (!value) return '';

  const parts = String(value)
    .split('^')
    .map(part => part.trim())
    .filter(Boolean);

  const cleaned: string[] = [];

  for (const part of parts) {
    if (/^\d{1,2}:\d{2}(\s*(AM|PM))?$/i.test(part)) continue;
    if (/^\d+$/.test(part)) continue;

    if (!cleaned.some(item => item.toLowerCase() === part.toLowerCase())) {
      cleaned.push(part);
    }
  }

  return cleaned.join(' · ');
}

function pointAddress(point: Point, type: 'boarding' | 'dropping'): string {
  const prefix = type === 'boarding' ? 'boarding' : 'dropping';

  const address = cleanPointText(point?.[`${prefix}_Address`]);
  const landmark = cleanPointText(point?.[`${prefix}_Landmark`]);

  const name = cleanPointText(
    point?.[`${prefix}_Name`] ??
    point?.[`${prefix}Name`] ??
    point?.point_Name ??
    point?.pointName ??
    point?.name
  );

  const parts = [address, landmark]
    .filter(Boolean)
    .filter(value => !/^N\/?A$/i.test(value.trim()))
    .filter((value, index, array) =>
      array.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index
    )
    .filter(value => value.toLowerCase() !== name.toLowerCase());

  return parts.join(' · ');
}

function pointTime(point: Point, type: 'boarding' | 'dropping'): string {
  const prefix = type === 'boarding' ? 'boarding' : 'dropping';
  const value = point?.[`${prefix}_Time`] ?? point?.time;

  if (!value) return '';

  const raw = String(value).trim();

  if (/am|pm/i.test(raw)) return raw.toUpperCase();

  const match = raw.match(/^(\d{1,2}):(\d{2})/);

  if (match) {
    const hours = Number(match[1]);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    return `${String(displayHours).padStart(2, '0')}:${match[2]} ${suffix}`;
  }

  return raw;
}

function PointOption({
  point,
  type,
  selected,
  onPress,
}: {
  point: Point;
  type: 'boarding' | 'dropping';
  selected: boolean;
  onPress: () => void;
}) {
  const name = pointName(point, type);
  const address = pointAddress(point, type);
  const time = pointTime(point, type);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pointCard,
        selected && styles.pointCardSelected,
      ]}
    >
      <View style={styles.radioColumn}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </View>

      <View style={styles.pointDetails}>
        <Text style={styles.pointName}>{name}</Text>

        {!!address && (
          <Text style={styles.pointAddress}>{address}</Text>
        )}

        {!!time && (
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={14} color={C.burgundy} />
            <Text style={styles.pointTime}>{time}</Text>
          </View>
        )}
      </View>

      {selected && (
        <Ionicons name="checkmark-circle" size={21} color={C.burgundy} />
      )}
    </Pressable>
  );
}

export default function Points({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isWide = width >= 640;

  const params = route?.params || {};

  const boardingPoints: Point[] = useMemo(
    () => Array.isArray(params.boardingDetails) ? params.boardingDetails : [],
    [params.boardingDetails]
  );

  const droppingPoints: Point[] = useMemo(
    () => Array.isArray(params.droppingDetails) ? params.droppingDetails : [],
    [params.droppingDetails]
  );

  const [boarding, setBoarding] = useState<Point | null>(
    params.selectedBoardingPoint ||
      params.defaultBoarding ||
      (boardingPoints.length === 1 ? boardingPoints[0] : null)
  );

  const [dropping, setDropping] = useState<Point | null>(
    params.selectedDroppingPoint ||
      params.defaultDropping ||
      (droppingPoints.length === 1 ? droppingPoints[0] : null)
  );

  const [pointStep, setPointStep] = useState<'boarding' | 'dropping'>('boarding');

  const bus = params.bus || {};
  const busName = bus.operator_Name || bus.travel_Name || 'Selected bus';

  const selectedBoardingId = boarding
    ? pointId(boarding, 'boarding')
    : '';

  const selectedDroppingId = dropping
    ? pointId(dropping, 'dropping')
    : '';

  function handleContinue() {
    if (pointStep === 'boarding') {
      if (!boarding) {
        Alert.alert(
          'Select boarding point',
          'Please choose where you want to board the bus.'
        );
        return;
      }

      setPointStep('dropping');
      return;
    }

    if (!dropping) {
      Alert.alert(
        'Select dropping point',
        'Please choose where you want to get off the bus.'
      );
      return;
    }

    navigation.navigate('passengers', {
      ...params,
      selectedBoardingPoint: boarding,
      selectedDroppingPoint: dropping,
      defaultBoarding: boarding,
      defaultDropping: dropping,
      boardingId: selectedBoardingId,
      droppingId: selectedDroppingId,
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={[styles.header, isWide && styles.wide]}>
        <Pressable
          onPress={() => {
            if (pointStep === 'dropping') {
              setPointStep('boarding');
            } else {
              navigation.goBack();
            }
          }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={21} color={C.ink} />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Journey points</Text>
          <Text style={styles.headerSubtitle}>
            {pointStep === 'boarding'
              ? 'Choose your boarding location'
              : 'Choose your dropping location'}
          </Text>
        </View>

        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>2 of 4</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isWide && styles.wide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.routeCard}>
          <View style={styles.routeIcon}>
            <Ionicons name="bus-outline" size={22} color={C.burgundy} />
          </View>

          <View style={styles.routeText}>
            <Text style={styles.routeTitle} numberOfLines={1}>
              {params.from || 'Departure'} → {params.to || 'Destination'}
            </Text>
            <Text style={styles.routeSubtitle}>
              {params.date || 'Selected journey'} · {busName}
            </Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressDone}>
            <Ionicons name="checkmark" size={13} color={C.white} />
          </View>

          <View style={styles.progressLine} />

          <View style={pointStep === 'boarding' ? styles.progressActive : styles.progressDone}>
            {pointStep === 'boarding' ? (
              <Text style={styles.progressActiveText}>2</Text>
            ) : (
              <Ionicons name="checkmark" size={13} color={C.white} />
            )}
          </View>

          <View style={pointStep === 'dropping' ? styles.progressLine : styles.progressLineInactive} />

          <View style={pointStep === 'dropping' ? styles.progressActive : styles.progressPending}>
            <Text style={pointStep === 'dropping' ? styles.progressActiveText : styles.progressPendingText}>
              3
            </Text>
          </View>

          <View style={styles.progressLineInactive} />

          <View style={styles.progressPending}>
            <Text style={styles.progressPendingText}>4</Text>
          </View>
        </View>

        {pointStep === 'boarding' && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}>
                <Ionicons name="location-outline" size={19} color={C.burgundy} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Boarding point</Text>
                <Text style={styles.sectionSubtitle}>
                  Where would you like to board?
                </Text>
              </View>

              <Text style={styles.count}>
                {boardingPoints.length} points
              </Text>
            </View>

            {boardingPoints.length === 0 ? (
              <Text style={styles.emptyText}>
                No boarding points are available for this bus.
              </Text>
            ) : (
              boardingPoints.map((point, index) => {
                const id = pointId(point, 'boarding');
                const selected =
                  !!boarding &&
                  (selectedBoardingId
                    ? selectedBoardingId === id
                    : boarding === point);

                return (
                  <PointOption
                    key={id || `boarding-${index}`}
                    point={point}
                    type="boarding"
                    selected={selected}
                    onPress={() => setBoarding(point)}
                  />
                );
              })
            )}
          </View>
        )}

        {pointStep === 'dropping' && (
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIcon}>
                <Ionicons name="flag-outline" size={19} color={C.burgundy} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Dropping point</Text>
                <Text style={styles.sectionSubtitle}>
                  Where would you like to get off?
                </Text>
              </View>

              <Text style={styles.count}>
                {droppingPoints.length} points
              </Text>
            </View>

            {droppingPoints.length === 0 ? (
              <Text style={styles.emptyText}>
                No dropping points are available for this bus.
              </Text>
            ) : (
              droppingPoints.map((point, index) => {
                const id = pointId(point, 'dropping');
                const selected =
                  !!dropping &&
                  (selectedDroppingId
                    ? selectedDroppingId === id
                    : dropping === point);

                return (
                  <PointOption
                    key={id || `dropping-${index}`}
                    point={point}
                    type="dropping"
                    selected={selected}
                    onPress={() => setDropping(point)}
                  />
                );
              })
            )}
          </View>
        )}

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={C.burgundy}
          />
          <Text style={styles.infoText}>
            {pointStep === 'boarding'
              ? 'Choose your boarding location to continue to the drop point.'
              : 'Please verify your dropping location before continuing.'}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.fareInfo}>
          <Text style={styles.fareLabel}>Total seat fare</Text>
          <Text style={styles.fareValue}>
            ₹{Number(params.totalFare || 0).toLocaleString('en-IN')}
          </Text>
        </View>

        <Pressable
          onPress={handleContinue}
          disabled={pointStep === 'boarding' ? !boarding : !dropping}
          style={[
            styles.continueButton,
            ((pointStep === 'boarding' && !boarding) ||
              (pointStep === 'dropping' && !dropping)) &&
              styles.continueDisabled,
          ]}
        >
          <Text style={styles.continueText}>
            {pointStep === 'boarding' ? 'Continue to dropping' : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </Pressable>
      </View>
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
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.paper,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    marginBottom: 20,
  },
  routeIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: {
    flex: 1,
    marginLeft: 12,
  },
  routeTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  routeSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    paddingHorizontal: 25,
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
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: C.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressActiveText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '700',
  },
  progressPending: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#E9E3DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPendingText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  progressLine: {
    width: 35,
    height: 2,
    backgroundColor: C.green,
  },
  progressLineInactive: {
    width: 35,
    height: 2,
    backgroundColor: C.border,
  },
  section: {
    backgroundColor: C.paper,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    marginBottom: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.burgundyLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  count: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  pointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    marginBottom: 9,
  },
  pointCardSelected: {
    borderColor: C.burgundy,
    backgroundColor: C.burgundyLight,
  },
  radioColumn: {
    paddingRight: 11,
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#B8AAA2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: C.burgundy,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.burgundy,
  },
  pointDetails: {
    flex: 1,
  },
  pointName: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  pointAddress: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  pointTime: {
    color: C.burgundy,
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5,
  },
  emptyText: {
    color: C.muted,
    fontSize: 12,
    paddingVertical: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 13,
    backgroundColor: C.burgundyLight,
    marginBottom: 10,
  },
  infoText: {
    flex: 1,
    color: C.ink,
    fontSize: 11,
    lineHeight: 16,
    marginLeft: 9,
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
  continueDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
});