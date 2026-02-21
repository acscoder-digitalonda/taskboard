import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, borderRadius, spacing } from '../theme/tokens';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  backlog: { color: colors.status.backlog, label: 'Backlog' },
  doing: { color: colors.status.doing, label: 'Doing' },
  waiting: { color: colors.status.waiting, label: 'Waiting' },
  done: { color: colors.status.done, label: 'Done' },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.medium },
});
