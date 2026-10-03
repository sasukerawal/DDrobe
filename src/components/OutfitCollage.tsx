import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem } from '@/types';

interface Props {
  top?: ClosetItem | null;
  bottom?: ClosetItem | null;
  shoe?: ClosetItem | null;
  accessory?: ClosetItem | null;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

// 2×2 grid: top, bottom / shoe, accessory. Empty slots show a quiet placeholder.
export function OutfitCollage({ top, bottom, shoe, accessory, style, radius = 14 }: Props) {
  const colors = useThemeColors();

  const cell = (item: ClosetItem | null | undefined) => (
    <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
      {item ? (
        <Image source={item.image_url} style={styles.image} contentFit="contain" transition={120} />
      ) : (
        <Ionicons name="add" size={18} color={colors.textTertiary} />
      )}
    </View>
  );

  return (
    <View style={[styles.grid, { borderRadius: radius, backgroundColor: colors.separator }, style]}>
      <View style={styles.row}>
        {cell(top)}
        {cell(bottom)}
      </View>
      <View style={styles.row}>
        {cell(shoe)}
        {cell(accessory)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { aspectRatio: 1, overflow: 'hidden', gap: 1 },
  row: { flex: 1, flexDirection: 'row', gap: 1 },
  cell: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
});
