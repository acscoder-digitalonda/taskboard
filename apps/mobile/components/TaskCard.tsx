import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius, shadows } from '../theme/tokens';

interface TaskCardProps {
  title: string;
  status: string;
  assigneeName?: string;
  assigneeColor?: string;
  assigneeInitials?: string;
  projectName?: string;
  projectColor?: string;
  dueLabel?: string;
  isOverdue?: boolean;
  priority?: number;
  onPress?: () => void;
}

export default function TaskCard({
  title,
  status,
  assigneeName,
  assigneeColor,
  assigneeInitials,
  projectName,
  projectColor,
  dueLabel,
  isOverdue,
  priority,
  onPress,
}: TaskCardProps) {
  const statusColors: Record<string, string> = {
    backlog: colors.status.backlog,
    doing: colors.status.doing,
    waiting: colors.status.waiting,
    done: colors.status.done,
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.statusBar, { backgroundColor: statusColors[status] || colors.gray[400] }]} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.meta}>
          {projectName && (
            <View style={[styles.badge, { backgroundColor: (projectColor || colors.gray[400]) + '20' }]}>
              <View style={[styles.dot, { backgroundColor: projectColor || colors.gray[400] }]} />
              <Text style={[styles.badgeText, { color: projectColor || colors.gray[600] }]}>{projectName}</Text>
            </View>
          )}
          {dueLabel && (
            <Text style={[styles.dueText, isOverdue && styles.overdueText]}>{dueLabel}</Text>
          )}
        </View>
        {assigneeInitials && (
          <View style={styles.assigneeRow}>
            <View style={[styles.avatar, { backgroundColor: assigneeColor || colors.gray[400] }]}>
              <Text style={styles.avatarText}>{assigneeInitials}</Text>
            </View>
            {assigneeName && <Text style={styles.assigneeName}>{assigneeName}</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.9,
    borderColor: colors.gray[300],
  },
  statusBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[900],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.medium,
  },
  dueText: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[500],
  },
  overdueText: {
    color: colors.danger,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
  },
  assigneeName: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[500],
  },
});
