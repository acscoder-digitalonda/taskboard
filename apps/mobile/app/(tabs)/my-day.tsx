import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import TaskCard from '../../components/TaskCard';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useEffect, useState, useCallback } from 'react';

export default function MyDayScreen() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [taskRes, userRes, projRes] = await Promise.all([
        supabase.from('tasks').select('*').order('priority', { ascending: true }),
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
      console.error('My Day fetch error:', err);
      Alert.alert('Connection Error', 'Could not load your tasks. Pull down to retry.');
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getUser(id: string) { return users.find((u: any) => u.id === id); }
  function getProject(id?: string) { return id ? projects.find((p: any) => p.id === id) : undefined; }

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const myTasks = tasks.filter(
    t => t.assignee_id === currentUser?.id && t.status !== 'done' && t.due_at && new Date(t.due_at) <= today
  );
  const upcoming = tasks.filter(
    t => t.assignee_id === currentUser?.id && t.status !== 'done' && t.due_at && new Date(t.due_at) > today
  ).sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  const top3 = myTasks.slice(0, 3);
  const more = myTasks.slice(3);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary[500]} />}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},</Text>
        <Text style={styles.userName}>{currentUser?.name || 'there'}</Text>
      </View>

      {/* Today section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today ({myTasks.length})</Text>
        {top3.length === 0 ? (
          <EmptyState icon="✅" title="All clear for today!" subtitle="No tasks due today" />
        ) : (
          top3.map(task => {
            const user = getUser(task.assignee_id);
            const project = getProject(task.project_id);
            return (
              <TaskCard
                key={task.id}
                title={task.title}
                status={task.status}
                assigneeName={user?.name}
                assigneeColor={user?.color}
                assigneeInitials={user?.initials}
                projectName={project?.name}
                projectColor={project?.color}
                onPress={() => router.push(`/task/${task.id}`)}
              />
            );
          })
        )}
        {more.map(task => {
          const user = getUser(task.assignee_id);
          const project = getProject(task.project_id);
          return (
            <TaskCard
              key={task.id}
              title={task.title}
              status={task.status}
              assigneeName={user?.name}
              assigneeColor={user?.color}
              assigneeInitials={user?.initials}
              projectName={project?.name}
              projectColor={project?.color}
              onPress={() => router.push(`/task/${task.id}`)}
            />
          );
        })}
      </View>

      {/* Upcoming section */}
      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming ({upcoming.length})</Text>
          {upcoming.map(task => {
            const user = getUser(task.assignee_id);
            const project = getProject(task.project_id);
            return (
              <TaskCard
                key={task.id}
                title={task.title}
                status={task.status}
                assigneeName={user?.name}
                assigneeColor={user?.color}
                assigneeInitials={user?.initials}
                projectName={project?.name}
                projectColor={project?.color}
                onPress={() => router.push(`/task/${task.id}`)}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg },
  greeting: { marginBottom: spacing['2xl'] },
  greetingText: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[500],
  },
  userName: {
    fontSize: typography.fontSize['2xl'],
    fontFamily: typography.fontFamily.black,
    color: colors.gray[900],
  },
  section: { marginBottom: spacing['2xl'] },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[900],
    marginBottom: spacing.md,
  },
});
