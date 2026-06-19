import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiCounter from '../utils/ApiCounter';

/**
 * Floating debug pill showing total Firestore operations this session
 * (reads + writes + listener deliveries). Tap to reset. Mounted at App root.
 */
export default function DebugApiCounter() {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => ApiCounter.subscribe(setCount), []);

  useEffect(() => {
    if (count === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 250);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <View pointerEvents="box-none" style={[s.host, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={() => ApiCounter.reset()} style={[s.pill, flash && s.pillFlash]}>
        <View style={s.dot} />
        <Text style={s.label}>FB</Text>
        <Text style={s.value}>{count}</Text>
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
  dot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3ddc97' },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  value: { color: '#fff', fontSize: 12, fontWeight: '800', minWidth: 16, textAlign: 'right' },
});
