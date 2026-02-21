import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import StatusBadge from '../../components/StatusBadge';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';

export default function NewTaskScreen() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('backlog');
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [userRes, projRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('projects').select('*'),
      ]);
      setUsers(userRes.data || []);
      setProjects(projRes.data || []);
      if (currentUser) setAssigneeId(currentUser.id);
    }
    load();
  }, [currentUser]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a task title');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      status,
      assignee_id: assigneeId || currentUser?.id,
      project_id: projectId,
      priority: 3,
      created_via: 'mobile',
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Failed to create task. Please try again.');
    } else {
      router.back();
    }
  }

  const statuses = ['backlog', 'doing', 'waiting', 'done'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Task</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || !title.trim()}
          style={[styles.saveButton, (!title.trim() || saving) && styles.saveButtonDisabled]}
        >
          <Text style={[styles.saveText, (!title.trim() || saving) && styles.saveTextDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <TextInput
          style={styles.titleInput}
          placeholder="What needs to be done?"
          placeholderTextColor={colors.gray[400]}
          value={title}
          onChangeText={setTitle}
          autoFocus
          multiline
          maxLength={500}
        />

        {/* Status */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {statuses.map(s => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusOption, status === s && styles.statusOptionActive]}
              >
                <StatusBadge status={s} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Assignee */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Assignee</Text>
          <View style={styles.assigneeRow}>
            {users.map((u: any) => (
              <Pressable
                key={u.id}
                onPress={() => setAssigneeId(u.id)}
                style={[styles.userOption, assigneeId === u.id && styles.userOptionActive]}
              >
                <UserAvatar initials={u.initials} color={u.color} avatarUrl={u.avatar_url} size={36} />
                <Text style={[styles.userOptionName, assigneeId === u.id && styles.userOptionNameActive]}>
                  {u.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Project */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Project</Text>
          <View style={styles.projectRow}>
            <Pressable
              onPress={() => setProjectId(null)}
              style={[styles.projectChip, projectId === null && styles.projectChipActive]}
            >
              <Text style={[styles.projectChipText, projectId === null && styles.projectChipTextActive]}>
                None
              </Text>
            </Pressable>
            {projects.map((p: any) => (
              <Pressable
                key={p.id}
                onPress={() => setProjectId(p.id)}
                style={[
                  styles.projectChip,
                  projectId === p.id && { backgroundColor: p.color + '20', borderColor: p.color },
                ]}
              >
                <View style={[styles.projectDot, { backgroundColor: p.color }]} />
                <Text
                  style={[
                    styles.projectChipText,
                    projectId === p.id && { color: p.color },
                  ]}
                >
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  cancelButton: { padding: spacing.sm },
  cancelText: { fontSize: typography.fontSize.base, fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
  },
  saveButton: { padding: spacing.sm, backgroundColor: colors.primary[500], borderRadius: borderRadius.md, paddingHorizontal: spacing.lg },
  saveButtonDisabled: { backgroundColor: colors.gray[200] },
  saveText: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.white },
  saveTextDisabled: { color: colors.gray[400] },
  content: { padding: spacing.lg, gap: spacing['2xl'] },
  titleInput: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[900],
    borderBottomWidth: 2,
    borderBottomColor: colors.primary[500],
    paddingBottom: spacing.md,
    minHeight: 48,
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statusOption: {
    padding: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statusOptionActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  assigneeRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  userOption: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  userOptionActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  userOptionName: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.medium, color: colors.gray[600] },
  userOptionNameActive: { color: colors.primary[600] },
  projectRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'transparent',
    gap: spacing.xs,
  },
  projectChipActive: { backgroundColor: colors.primary[50], borderColor: colors.primary[500] },
  projectChipText: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.medium, color: colors.gray[600] },
  projectChipTextActive: { color: colors.primary[600] },
  projectDot: { width: 8, height: 8, borderRadius: 4 },
});
