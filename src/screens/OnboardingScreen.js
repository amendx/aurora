import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  ScrollView,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconCalendarMonth, IconUsersGroup, IconClockHour4 } from '@tabler/icons-react-native';
import { useColors, Typography, Spacing, BorderRadius } from '../constants/DesignSystem';

const { width: W, height: H } = Dimensions.get('window');

const STEPS = [
  {
    title: 'Organize seus turnos',
    subtitle: 'Visualize todos os seus turnos em um só lugar, com clareza e simplicidade.',
    Icon: IconCalendarMonth,
    // blob positions/sizes per step [x%, y%, size, opacity]
    blobs: [
      { x: -0.15, y: -0.05, size: W * 0.9, opacity: 0.45 },
      { x: 0.5,  y: 0.15,  size: W * 0.6, opacity: 0.35 },
      { x: 0.2,  y: 0.25,  size: W * 0.5, opacity: 0.25 },
    ],
    blobColors: ['teal', 'ice', 'teal'],
  },
  {
    title: 'Saiba quem está junto',
    subtitle: 'Veja quem mais está escalado no mesmo turno que você.',
    Icon: IconUsersGroup,
    blobs: [
      { x: 0.4,  y: -0.1,  size: W * 0.8, opacity: 0.4  },
      { x: -0.1, y: 0.2,   size: W * 0.55, opacity: 0.35 },
      { x: 0.6,  y: 0.3,   size: W * 0.45, opacity: 0.28 },
    ],
    blobColors: ['mint', 'teal', 'mint'],
  },
  {
    title: 'Adicione horas facilmente',
    subtitle: 'Registre horas extras ou ajuste turnos com um toque.',
    Icon: IconClockHour4,
    blobs: [
      { x: 0.1,  y: 0.05,  size: W * 0.85, opacity: 0.38 },
      { x: 0.55, y: -0.05, size: W * 0.6,  opacity: 0.3  },
      { x: -0.2, y: 0.3,   size: W * 0.5,  opacity: 0.28 },
    ],
    blobColors: ['ice', 'teal', 'ice'],
  },
];

const CARD_HEIGHT = H * 0.58;

const OnboardingScreen = ({ onDone }) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  // Three blobs, each animated independently
  const blob0 = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    size: new Animated.Value(1),
    opacity: new Animated.Value(0.45),
  }).current;
  const blob1 = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    size: new Animated.Value(1),
    opacity: new Animated.Value(0.35),
  }).current;
  const blob2 = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    size: new Animated.Value(1),
    opacity: new Animated.Value(0.25),
  }).current;

  // Card entrance animation
  const cardAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);

  // Breathing pulse for blobs (idle)
  const pulseAnims = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  useEffect(() => {
    // Start idle breathing for each blob with staggered timing
    const loops = pulseAnims.map((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1.06,
            duration: 2800 + i * 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.94,
            duration: 2800 + i * 400,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, []);

  // Animate blobs to new step positions
  const animateToBlobStep = (s) => {
    const blobs = STEPS[s].blobs;
    const anims = [blob0, blob1, blob2];
    Animated.parallel([
      ...anims.map((b, i) =>
        Animated.parallel([
          Animated.spring(b.x, { toValue: blobs[i].x * W, useNativeDriver: false, damping: 18 }),
          Animated.spring(b.y, { toValue: blobs[i].y * H, useNativeDriver: false, damping: 18 }),
          Animated.spring(b.size, { toValue: blobs[i].size, useNativeDriver: false, damping: 18 }),
          Animated.timing(b.opacity, { toValue: blobs[i].opacity, duration: 600, useNativeDriver: false }),
        ])
      ),
    ]).start();
  };

  const animateCard = () => {
    cardAnim.setValue(30);
    Animated.spring(cardAnim, { toValue: 0, useNativeDriver: true, damping: 20 }).start();
  };

  useEffect(() => {
    animateToBlobStep(0);
    animateCard();
  }, []);

  const onSwipe = (e) => {
    const newStep = Math.round(e.nativeEvent.contentOffset.x / W);
    if (newStep !== step) {
      setStep(newStep);
      animateToBlobStep(newStep);
    }
  };

  const goNext = () => {
    if (step < STEPS.length - 1) {
      const next = step + 1;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setStep(next);
      animateToBlobStep(next);
    } else {
      onDone?.();
    }
  };

  const blobColor = (name) => {
    switch (name) {
      case 'teal': return C.primary;        // #6cc1c0
      case 'ice':  return C.primaryLight;   // #97cafc
      case 'mint': return C.primaryDark;    // #41b883
      default:     return C.primary;
    }
  };

  const renderBlob = (blobAnim, pulseAnim, colorName, index) => {
    // Outer view: layout props (left, top, width, height, opacity) — useNativeDriver: false
    // Inner view: transform scale — useNativeDriver: true
    // They must be on separate Animated.Views to avoid native/non-native driver conflicts.
    return (
      <Animated.View
        key={index}
        style={{
          position: 'absolute',
          left: blobAnim.x,
          top: blobAnim.y,
          width: blobAnim.size,
          height: blobAnim.size,
          opacity: blobAnim.opacity,
          overflow: 'visible',
        }}
      >
        <Animated.View
          style={{
            flex: 1,
            borderRadius: 9999,
            backgroundColor: blobColor(colorName),
            transform: [{ scale: pulseAnim }],
          }}
        />
      </Animated.View>
    );
  };

  const current = STEPS[step];

  return (
    <View style={[s.root, { backgroundColor: C.background.secondary }]}>
      {/* Blobs background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {renderBlob(blob0, pulseAnims[0], current.blobColors[0], 0)}
        {renderBlob(blob1, pulseAnims[1], current.blobColors[1], 1)}
        {renderBlob(blob2, pulseAnims[2], current.blobColors[2], 2)}
      </View>

      {/* Skip */}
      <View style={[s.skipRow, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={onDone} hitSlop={Spacing.md}>
          <Text style={[s.skipText, { color: C.text.secondary }]}>Pular</Text>
        </Pressable>
      </View>

      {/* Bottom card */}
      <Animated.View
        style={[
          s.card,
          {
            backgroundColor: C.background.primary,
            transform: [{ translateY: cardAnim }],
          },
        ]}
      >
        {/* Swipeable slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSwipe}
          scrollEventThrottle={16}
          style={s.slider}
          contentContainerStyle={s.sliderContent}
        >
          {STEPS.map((st, i) => (
            <View key={i} style={s.slide}>
              <View style={[s.illustration, { backgroundColor: C.primary + '18' }]}>
                <st.Icon size={52} color={C.primary} strokeWidth={1.5} />
              </View>
              <Text style={[s.title, { color: C.text.primary, fontFamily: Typography.fontFamily.display }]}>
                {st.title}
              </Text>
              <Text style={[s.subtitle, { color: C.text.secondary, fontFamily: Typography.fontFamily.regular }]}>
                {st.subtitle}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots + CTA — fixed below the slider */}
        <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  {
                    backgroundColor: i === step ? C.primary : C.border.medium,
                    width: i === step ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable
            style={[s.cta, { backgroundColor: C.primary }]}
            onPress={goNext}
          >
            <Text style={[s.ctaText, { fontFamily: Typography.fontFamily.bold }]}>
              {step < STEPS.length - 1 ? 'Continuar' : 'Começar'}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  skipRow: {
    position: 'absolute',
    top: 0,
    right: Spacing.lg,
    zIndex: 10,
  },
  skipText: {
    fontSize: Typography.fontSize.subhead,
    fontWeight: '500',
  },
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: H * 0.58,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: Spacing.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  slider: {
    flex: 1,
  },
  sliderContent: {
    // no extra styles needed — paging handled by pagingEnabled
  },
  slide: {
    width: W,
    paddingHorizontal: Spacing.lg,
  },
  illustration: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.subhead,
    lineHeight: Typography.fontSize.subhead * 1.6,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  cta: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: Typography.fontSize.callout,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
