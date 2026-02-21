import { View, Text, FlatList, Pressable, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [newMessage, setNewMessage] = useState('');
  const inputRef = useRef<TextInput>(null);

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

  // Realtime subscription for messages in the selected channel
  useEffect(() => {
    if (!selectedChannel) return;

    const channel = supabase
      .channel(`messages:${selectedChannel}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${selectedChannel}`,
        },
        () => {
          fetchMessages(selectedChannel);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannel, fetchMessages]);

  const sendMessage = useCallback(async () => {
    const body = newMessage.trim();
    if (!body || !selectedChannel || !currentUser) return;

    setNewMessage('');

    await supabase.from('messages').insert({
      channel_id: selectedChannel,
      sender_id: currentUser.id,
      body,
    });

    fetchMessages(selectedChannel);
  }, [newMessage, selectedChannel, currentUser, fetchMessages]);

  function getUser(id: string) { return users.find((u: any) => u.id === id); }

  if (selectedChannel) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
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
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor={colors.gray[400]}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={sendMessage}
          />
          <Pressable
            onPress={sendMessage}
            style={({ pressed }) => [
              styles.sendButton,
              !newMessage.trim() && styles.sendButtonDisabled,
              pressed && newMessage.trim() ? styles.sendButtonPressed : null,
            ]}
            disabled={!newMessage.trim()}
          >
            <Text style={[
              styles.sendButtonText,
              !newMessage.trim() && styles.sendButtonTextDisabled,
            ]}>
              Send
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.gray[900],
  },
  sendButton: {
    height: 40,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonPressed: {
    backgroundColor: colors.primary[600],
  },
  sendButtonDisabled: {
    backgroundColor: colors.gray[200],
  },
  sendButtonText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.white,
  },
  sendButtonTextDisabled: {
    color: colors.gray[400],
  },
  loadingWrap: { padding: spacing['2xl'], alignItems: 'center' },
  loadingText: { fontFamily: typography.fontFamily.medium, color: colors.gray[500] },
});
