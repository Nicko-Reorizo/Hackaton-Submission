import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}

export function Button({ title, onPress, disabled, loading, secondary }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }} onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || loading) && styles.disabled, pressed && styles.pressed]}>
      {loading && <ActivityIndicator color={secondary ? colors.primary : '#FFFFFF'} />}
      <Text style={[styles.text, secondary && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 56, borderRadius: 16, backgroundColor: colors.primary, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  text: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  secondary: { backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.ink },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
