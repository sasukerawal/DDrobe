import React, { useEffect } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

export interface MenuOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  checked?: boolean;
}

interface DropdownMenuProps {
  visible: boolean;
  onDismiss: () => void;
  options: MenuOption[];
  title?: string;
}

export function DropdownMenu({ visible, onDismiss, options, title }: DropdownMenuProps) {
  const colors = useThemeColors();

  // On iOS delegate to the native ActionSheet
  useEffect(() => {
    if (!visible || Platform.OS !== 'ios') return;
    const labels = ['Cancel', ...options.map((o) => o.label)];
    const destructiveIdx = options.findIndex((o) => o.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex: 0,
        destructiveButtonIndex: destructiveIdx >= 0 ? destructiveIdx + 1 : undefined,
      },
      (idx) => {
        onDismiss();
        if (idx > 0) options[idx - 1].onPress();
      },
    );
  }, [visible]);

  // iOS: ActionSheet is shown imperatively — render nothing
  if (Platform.OS === 'ios') return null;

  // Android: custom bottom-sheet Modal
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={styles.handle} />
        {title && (
          <Text style={[styles.sheetTitle, { color: colors.textSecondary }]}>{title}</Text>
        )}
        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.option,
              i < options.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.separator,
              },
            ]}
            onPress={() => {
              onDismiss();
              opt.onPress();
            }}
            activeOpacity={0.7}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={20}
                color={opt.destructive ? Colors.danger : colors.text}
                style={{ marginRight: 14 }}
              />
            )}
            <Text style={[styles.optionLabel, { color: opt.destructive ? Colors.danger : colors.text }]}>
              {opt.label}
            </Text>
            {opt.checked && (
              <Ionicons
                name="checkmark"
                size={18}
                color={Colors.accent}
                style={{ marginLeft: 'auto' }}
              />
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 34 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.three,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(120,120,128,0.4)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 10,
    letterSpacing: 0.2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '400',
  },
});
