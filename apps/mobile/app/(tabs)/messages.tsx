import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { colors, typography, spacing, borderRadius } from '../../theme/tokens';
import UserAvatar from '../../components/UserAvatar';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

interface ChannelItem {
  id: string;
  name: string | null;
  type: string;
  last_message_body?: string;
  last_message_at?: string;
  unread_count?: number;
}

export default function MessagesScreen() {
  const { currentUser } = useAuth();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    if (!currentUser) return;
    const { data: memberData } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', currentUser.id);

    if (!memberData) { setLoading(false); return; }

    const channelIds = memberData.map(m => m.channel_id);
    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .in('id', channelIds)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    setChannels(channelData || []);
    setLoading(false);
  }, [currentUser]);

  const fetchMessages = useCallback(async (channelId: string) => {
    const [msgRes, userRes] = await Promise.all([
      supabase.from('messages').select('*').eq('channel_id', channelId).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('users').select('id, name, initials, color, avatar_url'),
    ]);
    setMessages(msgRes.data || []);
    setUsers(userRes.data || []);
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  function getUser(id: string) { return users.find((u: any) => u.id === id); }

  if (selectedChannel) {
    return (
      <View style={styles.container}>
        <Pressable onPress={() => setSelectedChannel(null)} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <FlatList
          data={messages}
          inverted
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const sender = getUser(item.sender_id);
            const isMe = item.sender_id === currentUser?.id;
            return (
              <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
                {!isMe && sender && (
                  <Text style={styles.senderName}>{sender.name}</Text>
                )}
                <Text style={[styles.messageText, isMe && styles.myMessageText]}>{item.body}</Text>
              </View>
            );
          }}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={<EmptyState icon="💬" title="No messages yet" />}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={channels}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.channelRow}
            onPress={() => { setSelectedChannel(item.id); fetchMessages(item.id); }}
          >
            <View style={styles.channelIcon}>
              <Text style={styles.channelIconText}>{item.type === 'direct' ? '👤' : '#'}</Text>
            </View>
            <View style={styles.channelInfo}>
              <Text style={styles.channelName}>{item.name || 'Direct Message'}</Text>
            </View>
          </Pressable>
        )}
        contentContainerStyle={styles.channelList}
        ListEmptyComponent={
          loading
            ? <View style={styles.loadingWrap}><Text style={styles.loadingText}>Loading...</Text></View>
            : <EmptyState icon="💬" title="No conversations" subtitle="Start a new conversation" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  channelList: { padding: spacing.lg },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelIconText: { fontSize: 18 },
  channelInfo: { flex: 1 },
  channelName: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.gray[900],
  },
  backButton: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  backText: { fontSize: typography.fontSize.base, fontFamily: typography.fontFamily.bold, color: colors.primary[500] },
  messageList: { padding: spacing.lg, gap: spacing.sm },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
  },
  myMessage: {
    backgroundColor: colors.primary[100],
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: colors.gray[100],
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.gray[600],
    marginBottom: 2,
  },
  messageText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[900],
  },
  myMessageText: { color: colors.gray[900] },
  loadingWrap: { padding: spacing['2xl'], alignItems: 'center' },
  loadingText: { fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
});
