import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useColors } from '../constants/DesignSystem';

// Loader exibido enquanto AuthContext.checkAuthStatus está rolando — evita
// o flash do AuthScreen durante o re-auth silencioso de um usuário com sessão
// recente. Estética: logo do Aurora pulsando + 3 dots em wave (eco da curva
// swooping do logo).
export default function AuthBootstrapScreen() {
  const C = useColors();
  const pulse = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();

    const animateDot = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 360, useNativeDriver: true }),
          Animated.delay(720 - delay),
        ]),
      ).start();
    animateDot(d1, 0);
    animateDot(d2, 180);
    animateDot(d3, 360);
  }, []);

  const logoOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });
  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const dotStyle = (val) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }) }],
  });

  return (
    <View style={[styles.root, { backgroundColor: C.background.primary }]}>
      <Animated.Image
        source={require('../../assets/icon.png')}
        style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, { backgroundColor: C.primary }, dotStyle(d1)]} />
        <Animated.View style={[styles.dot, { backgroundColor: C.primary }, dotStyle(d2)]} />
        <Animated.View style={[styles.dot, { backgroundColor: C.primary }, dotStyle(d3)]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 128, height: 128, marginBottom: 40 },
  dots: { flexDirection: 'row', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
