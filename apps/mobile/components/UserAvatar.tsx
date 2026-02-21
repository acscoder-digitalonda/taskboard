import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, typography } from '../theme/tokens';

interface UserAvatarProps {
  name?: string;
  initials?: string;
  color?: string;
  avatarUrl?: string;
  size?: number;
}

export default function UserAvatar({ name, initials, color, avatarUrl, size = 32 }: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityLabel={name ? `${name} avatar` : 'User avatar'}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color || colors.gray[400],
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
  fallback: { justifyContent: 'center', alignItems: 'center' },
  initials: { color: colors.white, fontFamily: typography.fontFamily.bold },
});
