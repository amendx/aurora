import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiCounter from '../utils/ApiCounter';
import WebClientCounter from '../utils/WebClientCounter';

/**
 * Floating debug pills showing total Firestore and WebClient operations this session.
 * Tap to reset. Mounted at App root.
 */
export default function DebugApiCounter() {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [wcCount, setWcCount] = useState(0);
  const [wcFlash, setWcFlash] = useState(false);

  useEffect(() => ApiCounter.subscribe(setCount), []);
  useEffect(() => WebClientCounter.subscribe(setWcCount), []);

  useEffect(() => {
    if (count === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 250);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (wcCount === 0) return;
    setWcFlash(true);
    const t = setTimeout(() => setWcFlash(false), 250);
    return () => clearTimeout(t);
  }, [wcCount]);

  return (
    <View pointerEvents="box-none" style={[s.host, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => ApiCounter.reset()} style={[s.pill, flash && s.pillFlash]}>
        <View style={s.dot} />
        <Text style={s.label}>FB</Text>
        <Text style={s.value}>{count}</Text>
      </Pressable>
      <Pressable onPress={() => WebClientCounter.reset()} style={[s.pill, s.wcPill, wcFlash && s.wcPillFlash]}>
        <View style={s.wcDot} />
        <Text style={s.label}>WC</Text>
        <Text style={s.value}>{wcCount}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0, right: 8,
    zIndex: 99999999999,
    elevation: 99,
    flexDirection: 'row',
    gap: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 8 },
    }),
  },
  pillFlash: { backgroundColor: 'rgba(220,80,80,0.92)' },
  wcPill: {},
  wcPillFlash: { backgroundColor: 'rgba(50,120,220,0.92)' },
  dot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3ddc97' },
  wcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5b9bd5' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  value: { color: '#fff', fontSize: 12, fontWeight: '800', minWidth: 16, textAlign: 'right' },
});
