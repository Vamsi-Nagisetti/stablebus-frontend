import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BusLoader from '@/features/search/screens/Busloader';

type Props = { visible: boolean; title: string; subtitle?: string; showBus?: boolean };

/** Calm full-screen loader: optional animated bus, one title, one subtitle, thin progress bar. */
export default function FullScreenLoader({ visible, title, subtitle, showBus = true }: Props) {
  const { width } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, progress]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={s.screen}>
        {showBus && <BusLoader width={Math.min(width - 50, 520)} />}
        <Text style={[s.title, !showBus && { marginTop: 0 }]}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>}
        <View style={s.track}>
          <Animated.View
            style={[
              s.fill,
              { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-95, 95] }) }] },
            ]}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F4ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  title: { color: '#382B28', fontSize: 20, fontWeight: '600', letterSpacing: -0.3, marginTop: 18, textAlign: 'center' },
  subtitle: { color: '#887A73', fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  track: { width: 190, height: 3, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E9DDD7', marginTop: 22 },
  fill: { width: '34%', height: '100%', borderRadius: 9, backgroundColor: '#783D4A' },
});