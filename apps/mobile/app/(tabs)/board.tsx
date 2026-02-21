import { View, Text, ScrollView, FlatList, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import TaskCard from '../../components/TaskCard';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', color: colors.status.backlog },
  { key: 'doing', label: 'Doing', color: colors.status.doing },
  { key: 'waiting', label: 'Waiting', color: colors.status.waiting },
  { key: 'done', label: 'Done', color: colors.status.done },
];

interface Task {
  id: string;
  title: string;
  status: string;
  assignee_id: string;
  project_id?: string;
  priority: number;
  due_at?: string;
  sort_order?: number;
}

interface UserData {
  id: string;
  name: string;
  initials: string;
  color: string;
}

interface ProjectData {
  id: string;
  name: string;
  color: string;
}

export default function BoardScreen() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [taskRes, userRes, projRes] = await Promise.all([
      supabase.from('tasks').select('*').order('sort_order', { ascending: true }),
      supabase.from('users').select('id, name, initials, color'),
      supabase.from('projects').select('id, name, color'),
    ]);
    setTasks(taskRes.data || []);
    setUsers(userRes.data || []);
    setProjects(projRes.data || []);
    setLoading(false);
  }

  function getUser(id: string) { return users.find(u => u.id === id); }
  function getProject(id?: string) { return id ? projects.find(p => p.id === id) : undefined; }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading board...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
    >
      {COLUMNS.map(col => {
        const columnTasks = tasks
          .filter(t => t.status === col.key)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        return (
          <View key={col.key} style={styles.column}>
            <View style={styles.columnHeader}>
              <View style={[styles.statusDot, { backgroundColor: col.color }]} />
              <Text style={styles.columnTitle}>{col.label}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{columnTasks.length}</Text>
              </View>
            </View>
            <FlatList
              data={columnTasks}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const user = getUser(item.assignee_id);
                const project = getProject(item.project_id);
                return (
                  <TaskCard
                    title={item.title}
                    status={item.status}
                    assigneeName={user?.name}
                    assigneeColor={user?.color}
                    assigneeInitials={user?.initials}
                    projectName={project?.name}
                    projectColor={project?.color}
                    onPress={() => router.push(`/task/${item.id}`)}
                  />
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyColumn}>
                  <Text style={styles.emptyText}>No tasks</Text>
                </View>
              }
              contentContainerStyle={styles.columnContent}
              showsVerticalScrollIndicator={false}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
  column: {
    width: 300,
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    maxHeight: '100%',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  columnTitle: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[700],
    flex: 1,
  },
  countBadge: {
    backgroundColor: colors.gray[300],
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.medium, color: colors.gray[600] },
  columnContent: { paddingBottom: spacing.lg },
  emptyColumn: {
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
  },
  emptyText: { fontFamily: typography.fontFamily.regular, color: colors.gray[400], fontSize: typography.fontSize.sm },
});
