import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { createAuthenticatedClient } from '@/utils/supabase';
import { colorSwatch } from '@/utils/stats';
import { useAuthStore } from '@/store/useAuthStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { StylePreferences } from '@/types';

const VIBES = ['Minimal', 'Classic', 'Streetwear', 'Sporty', 'Boho', 'Romantic', 'Edgy', 'Preppy'];
const FORMALITY: { value: NonNullable<StylePreferences['preferredFormality']>; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'business_casual', label: 'Smart casual' },
  { value: 'formal', label: 'Formal' },
];
const COLOURS = ['Black', 'White', 'Grey', 'Navy', 'Beige', 'Brown', 'Olive', 'Burgundy', 'Pink', 'Blue'];
const FITS: { value: NonNullable<StylePreferences['fit']>; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'regular', label: 'Regular' },
  { value: 'fitted', label: 'Fitted' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { dbUser, setDbUser } = useAuthStore();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const prefs = dbUser?.style_preferences ?? {};
  const [vibes, setVibes] = useState<string[]>(prefs.vibes ?? []);
  const [formality, setFormality] = useState(prefs.preferredFormality ?? 'casual');
  const [favoriteColors, setFavoriteColors] = useState<string[]>(prefs.favoriteColors ?? []);
  const [fit, setFit] = useState(prefs.fit ?? 'regular');
  const [displayName, setDisplayName] = useState(dbUser?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], value: string, set: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (list.includes(value)) set(list.filter((v) => v !== value));
    else if (list.length < max) set([...list, value]);
  };

  const save = async (skip: boolean) => {
    if (!dbUser) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const nextPrefs: StylePreferences = skip
        ? { ...prefs, onboarded: true }
        : { ...prefs, onboarded: true, vibes, preferredFormality: formality, favoriteColors, fit };
      const updates: Record<string, unknown> = { style_preferences: nextPrefs };
      if (!skip && displayName.trim()) updates.display_name = displayName.trim().slice(0, 40);

      const { error } = await createAuthenticatedClient(token).from('users').update(updates).eq('id', dbUser.id);
      if (error) throw error;
      setDbUser({ ...dbUser, ...(updates as object), style_preferences: nextPrefs });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.kicker}>Your style</Text>
            <Text style={styles.title}>Help your stylist get to know you</Text>
            <Text style={styles.subtitle}>Takes 30 seconds. Your answers shape every outfit suggestion.</Text>
          </View>

          <Question title="Which styles feel like you?" hint="Pick up to 3" styles={styles}>
            <View style={styles.chipRow}>
              {VIBES.map((v) => (
                <Chip key={v} label={v} active={vibes.includes(v)} onPress={() => toggle(vibes, v, setVibes, 3)} styles={styles} />
              ))}
            </View>
          </Question>

          <Question title="What do you dress for most days?" styles={styles}>
            <View style={styles.chipRow}>
              {FORMALITY.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  active={formality === f.value}
                  onPress={() => { Haptics.selectionAsync(); setFormality(f.value); }}
                  styles={styles}
                />
              ))}
            </View>
          </Question>

          <Question title="Colours you love wearing" hint="Pick up to 4" styles={styles}>
            <View style={styles.chipRow}>
              {COLOURS.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  swatch={colorSwatch(c)}
                  active={favoriteColors.includes(c)}
                  onPress={() => toggle(favoriteColors, c, setFavoriteColors, 4)}
                  styles={styles}
                />
              ))}
            </View>
          </Question>

          <Question title="How do you like things to fit?" styles={styles}>
            <View style={styles.chipRow}>
              {FITS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  active={fit === f.value}
                  onPress={() => { Haptics.selectionAsync(); setFit(f.value); }}
                  styles={styles}
                />
              ))}
            </View>
          </Question>

          <Question title="Name shown on your Lookbook posts" styles={styles}>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. maya.styles"
              placeholderTextColor={colors.textTertiary}
              maxLength={40}
              autoCapitalize="none"
            />
          </Question>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.skip} onPress={() => save(true)} disabled={saving}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={() => save(false)} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>Save my style</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Question({ title, hint, styles, children }: { title: string; hint?: string; styles: Styles; children: React.ReactNode }) {
  return (
    <View style={styles.question}>
      <View style={styles.questionHead}>
        <Text style={styles.questionTitle}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, swatch, onPress, styles }: { label: string; active: boolean; swatch?: string; onPress: () => void; styles: Styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.four },
  intro: { gap: 8 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.accent },
  title: { fontSize: 28, fontWeight: '700', color: c.text, letterSpacing: -0.6, lineHeight: 34 },
  subtitle: { fontSize: 15, lineHeight: 22, color: c.textSecondary },
  question: { gap: Spacing.two },
  questionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  questionTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textTertiary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipActive: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: 15, fontWeight: '600', color: c.text },
  chipTextActive: { color: c.background },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  input: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    fontSize: 16,
    color: c.text,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.separator,
  },
  skip: { minHeight: 52, paddingHorizontal: Spacing.four, justifyContent: 'center', alignItems: 'center' },
  skipText: { fontSize: 16, fontWeight: '600', color: c.textSecondary },
  primary: { flex: 1, minHeight: 52, borderRadius: Radius.button, backgroundColor: c.text, justifyContent: 'center', alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700', color: c.background },
});
