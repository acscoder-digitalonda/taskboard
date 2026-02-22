import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme/tokens';
import { useAuth } from '../../lib/auth';
import UserAvatar from '../../components/UserAvatar';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export default function MoreScreen() {
  const router = useRouter();
  const { currentUser, signOut } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const { data: projData, error: projError } = await supabase.from('projects').select('*').order('created_at');
        if (projError) console.error('Failed to fetch projects:', projError.message);
        setProjects(projData || []);

        const { data: tasks, error: taskError } = await supabase.from('tasks').select('project_id');
        if (taskError) console.error('Failed to fetch task counts:', taskError.message);
        const counts: Record<string, number> = {};
        (tasks || []).forEach((t: any) => {
          if (t.project_id) counts[t.project_id] = (counts[t.project_id] || 0) + 1;
        });
        setTaskCounts(counts);
      } catch (err: any) {
        console.error('More screen fetch error:', err);
      }
    }
    load();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User profile card */}
      <View style={styles.profileCard}>
        <UserAvatar
          name={currentUser?.name}
          initials={currentUser?.initials}
          color={currentUser?.color}
          avatarUrl={currentUser?.avatar_url}
          size={56}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{currentUser?.name}</Text>
          <Text style={styles.profileEmail}>{currentUser?.email || 'Team member'}</Text>
        </View>
      </View>

      {/* Projects section */}
      <Text style={styles.sectionTitle}>Projects</Text>
      <View style={styles.projectGrid}>
        {projects.map(p => (
          <View key={p.id} style={[styles.projectCard, { borderLeftColor: p.color }]}>
            <Text style={styles.projectName}>{p.name}</Text>
            <Text style={styles.projectCount}>{taskCounts[p.id] || 0} tasks</Text>
          </View>
        ))}
      </View>

      {/* Menu items */}
      <View style={styles.menu}>
        {[
          { label: 'Notifications', icon: '🔔' },
          { label: 'Search', icon: '🔍' },
          { label: 'Settings', icon: '⚙️' },
        ].map(item => (
          <Pressable key={item.label} style={styles.menuItem}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        ))}
      </View>

      {/* Sign out */}
      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
  },
  profileEmail: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[500],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
  projectGrid: { gap: spacing.sm, marginBottom: spacing['2xl'] },
  projectCard: {
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderLeftWidth: 4,
    ...shadows.sm,
  },
  projectName: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
  },
  projectCount: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[500],
    marginTop: 2,
  },
  menu: {
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingTop: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    gap: spacing.md,
  },
  menuIcon: { fontSize: 20, width: 30, textAlign: 'center' },
  menuLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[900],
  },
  menuArrow: { fontSize: 20, color: colors.gray[400] },
  signOutButton: {
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.danger,
  },
});
