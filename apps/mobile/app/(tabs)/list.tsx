import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import TaskCard from '../../components/TaskCard';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useEffect, useState, useCallback } from 'react';

type SortKey = 'priority' | 'title' | 'due_at' | 'status';

function computeDueLabel(dueAt: string | null | undefined): string | undefined {
  if (!dueAt) return undefined;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueAt);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffMs = dueDay.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[due.getMonth()]} ${due.getDate()}`;
}

function computeIsOverdue(dueAt: string | null | undefined, status: string): boolean {
  if (!dueAt || status === 'done') return false;
  return new Date(dueAt) < new Date();
}

export default function ListScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('priority');

  const fetchData = useCallback(async () => {
    try {
      const [taskRes, userRes, projRes] = await Promise.all([
        supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
        supabase.from('users').select('id, name, initials, color'),
        supabase.from('projects').select('id, name, color'),
      ]);
      if (taskRes.error) console.error('Failed to fetch tasks:', taskRes.error.message);
      if (userRes.error) console.error('Failed to fetch users:', userRes.error.message);
      if (projRes.error) console.error('Failed to fetch projects:', projRes.error.message);
      setTasks(taskRes.data || []);
      setUsers(userRes.data || []);
      setProjects(projRes.data || []);
    } catch (err: any) {
      console.error('List fetch error:', err);
      Alert.alert('Connection Error', 'Could not load tasks. Pull down to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Supabase realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('tasks-list-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  function getUser(id: string) { return users.find((u: any) => u.id === id); }
  function getProject(id?: string) { return id ? projects.find((p: any) => p.id === id) : undefined; }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortBy === 'priority') return a.priority - b.priority;
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'due_at') return (a.due_at || 'z').localeCompare(b.due_at || 'z');
    if (sortBy === 'status') {
      const order = ['doing', 'waiting', 'backlog', 'done'];
      return order.indexOf(a.status) - order.indexOf(b.status);
    }
    return 0;
  });

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'title', label: 'Title' },
    { key: 'due_at', label: 'Due Date' },
  ];

  return (
    <View style={styles.container}>
      {/* Sort chips */}
      <FlatList
        horizontal
        data={sortOptions}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSortBy(item.key)}
            style={[styles.chip, sortBy === item.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, sortBy === item.key && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.chipBar}
        showsHorizontalScrollIndicator={false}
      />

      {/* Task list */}
      <FlatList
        data={sortedTasks}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const user = getUser(item.assignee_id);
          const project = getProject(item.project_id);
          const dueLabel = computeDueLabel(item.due_at);
          const isOverdue = computeIsOverdue(item.due_at, item.status);
          return (
            <TaskCard
              title={item.title}
              status={item.status}
              assigneeName={user?.name}
              assigneeColor={user?.color}
              assigneeInitials={user?.initials}
              projectName={project?.name}
              projectColor={project?.color}
              dueLabel={dueLabel}
              isOverdue={isOverdue}
              onPress={() => router.push(`/task/${item.id}`)}
            />
          );
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        ListEmptyComponent={
          loading
            ? <View style={styles.loadingContainer}><Text style={styles.loadingText}>Loading...</Text></View>
            : <EmptyState icon="📋" title="No tasks yet" subtitle="Create your first task to get started" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  chipBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
  },
  chipActive: { backgroundColor: colors.primary[500] },
  chipText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[600],
  },
  chipTextActive: { color: colors.white },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
  loadingContainer: { padding: spacing['2xl'], alignItems: 'center' },
  loadingText: { fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
});
