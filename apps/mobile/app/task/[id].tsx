import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import StatusBadge from '../../components/StatusBadge';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    async function load() {
      const [taskRes, userRes, projRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', id).single(),
        supabase.from('users').select('*'),
        supabase.from('projects').select('*'),
      ]);
      if (taskRes.data) {
        setTask(taskRes.data);
        setTitleDraft(taskRes.data.title);
      }
      setUsers(userRes.data || []);
      setProjects(projRes.data || []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function updateField(field: string, value: any) {
    const { error } = await supabase.from('tasks').update({ [field]: value }).eq('id', id);
    if (!error) setTask((prev: any) => ({ ...prev, [field]: value }));
  }

  async function handleDelete() {
    Alert.alert('Delete Task', 'Are you sure you want to delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('tasks').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  function getUser(userId: string) { return users.find((u: any) => u.id === userId); }
  function getProject(projId?: string) { return projId ? projects.find((p: any) => p.id === projId) : undefined; }

  if (loading || !task) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  const assignee = getUser(task.assignee_id);
  const project = getProject(task.project_id);
  const statuses = ['backlog', 'doing', 'waiting', 'done'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Task Detail</Text>
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>🗑</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title */}
        {editingTitle ? (
          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onBlur={() => { setEditingTitle(false); updateField('title', titleDraft); }}
            autoFocus
            multiline
          />
        ) : (
          <Pressable onPress={() => setEditingTitle(true)}>
            <Text style={styles.title}>{task.title}</Text>
          </Pressable>
        )}

        {/* Status picker */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {statuses.map(s => (
              <Pressable
                key={s}
                onPress={() => updateField('status', s)}
                style={[styles.statusOption, task.status === s && styles.statusOptionActive]}
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
                onPress={() => updateField('assignee_id', u.id)}
                style={[styles.userOption, task.assignee_id === u.id && styles.userOptionActive]}
              >
                <UserAvatar initials={u.initials} color={u.color} avatarUrl={u.avatar_url} size={36} />
                <Text style={[styles.userOptionName, task.assignee_id === u.id && styles.userOptionNameActive]}>
                  {u.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Project */}
        {project && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Project</Text>
            <View style={[styles.projectBadge, { borderLeftColor: project.color }]}>
              <Text style={styles.projectBadgeText}>{project.name}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {task.notes && task.notes.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Notes</Text>
            {task.notes.map((note: string, i: number) => (
              <View key={i} style={styles.noteCard}>
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Drive Links */}
        {task.drive_links && task.drive_links.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Links</Text>
            {task.drive_links.map((link: string, i: number) => (
              <Text key={i} style={styles.linkText}>{link}</Text>
            ))}
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaSection}>
          <Text style={styles.metaText}>Created {new Date(task.created_at).toLocaleDateString()}</Text>
          <Text style={styles.metaText}>Updated {new Date(task.updated_at).toLocaleDateString()}</Text>
          {task.created_via && <Text style={styles.metaText}>Via {task.created_via}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  closeButton: { padding: spacing.sm },
  closeText: { fontSize: 20, color: colors.gray[500] },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
  },
  deleteButton: { padding: spacing.sm },
  deleteText: { fontSize: 18 },
  content: { padding: spacing.lg, gap: spacing['2xl'] },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
  },
  titleInput: {
    fontSize: typography.fontSize['2xl'],
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
    borderBottomWidth: 2,
    borderBottomColor: colors.primary[500],
    paddingBottom: spacing.xs,
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
  userOptionName: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[600],
  },
  userOptionNameActive: { color: colors.primary[600] },
  projectBadge: {
    borderLeftWidth: 4,
    backgroundColor: colors.gray[50],
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  projectBadgeText: { fontFamily: typography.fontFamily.medium, color: colors.gray[700] },
  noteCard: {
    backgroundColor: colors.gray[50],
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  noteText: { fontFamily: typography.fontFamily.regular, color: colors.gray[700], lineHeight: 22 },
  linkText: {
    fontFamily: typography.fontFamily.regular,
    color: colors.primary[500],
    textDecorationLine: 'underline',
  },
  metaSection: {
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  metaText: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.regular, color: colors.gray[400] },
});
