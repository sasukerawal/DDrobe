import React, { ReactNode, useEffect } from 'react';
import { Keyboard, Platform, StatusBar, Text, TouchableWithoutFeedback, View, KeyboardAvoidingView } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

interface AuthShellProps {
  children: ReactNode;
  tagline?: string;
}

export function AuthShell({
  children,
  tagline = 'Your wardrobe. Curated daily.',
}: AuthShellProps) {
  const insets = useSafeAreaInsets();

  // Slide and fade are independent so the card background never inherits opacity.
  const slideY  = useSharedValue(64);
  const opacity = useSharedValue(0);

  useEffect(() => {
    slideY.value  = withSpring(0, { damping: 22, stiffness: 180, mass: 0.85 });
    opacity.value = withTiming(1, { duration: 380 });
  }, []);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.accent }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.accent} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View
          style={{
            minHeight: 164,
            paddingTop: insets.top + 16,
            paddingHorizontal: 28,
            paddingBottom: 28,
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          {/* Ghost D */}
          <Text
            style={{
              position: 'absolute',
              right: -12,
              bottom: -20,
              fontSize: 200,
              fontWeight: '800',
              color: 'rgba(0,0,0,0.13)',
              letterSpacing: -6,
              lineHeight: 220,
            }}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            D
          </Text>

          {/* Wordmark */}
          <Text
            style={{
              fontSize: 38,
              fontWeight: '700',
              color: '#FFFFFF',
              letterSpacing: -1.4,
              marginBottom: 6,
              includeFontPadding: false,
            }}
          >
            DDrobe
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', letterSpacing: 0.1 }}>
            {tagline}
          </Text>
        </View>
      </TouchableWithoutFeedback>

      <Animated.View style={[{ flex: 1 }, slideStyle]}>
        <View
          style={{
            flex: 1,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
          }}
        >
          <Animated.View style={[{ flex: 1 }, fadeStyle]}>
            {children}
          </Animated.View>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
