import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

// Shimmer placeholder pra campos de valor enquanto refresh do WebClient está em voo.
// Usar no lugar de mostrar valor stale do cache (que troca abruptamente quando a API responde).
const SkeletonBox = ({ width = '100%', height = 20, style }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#90a4ae22', borderRadius: 6, opacity }, style]}
    />
  );
};

export default SkeletonBox;
export { SkeletonBox };
