"use client";

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../../theme/tokens';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { focused: IoniconsName; unfocused: IoniconsName }> = {
  board: { focused: 'grid', unfocused: 'grid-outline' },
  list: { focused: 'list', unfocused: 'list-outline' },
  'my-day': { focused: 'sunny', unfocused: 'sunny-outline' },
  messages: { focused: 'chatbubbles', unfocused: 'chatbubbles-outline' },
  more: { focused: 'ellipsis-horizontal-circle', unfocused: 'ellipsis-horizontal-circle-outline' },
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.medium,
          fontSize: 11,
        },
        tabBarStyle: {
          borderTopColor: colors.gray[200],
          backgroundColor: colors.white,
        },
        headerStyle: {
          backgroundColor: colors.white,
        },
        headerTitleStyle: {
          fontFamily: typography.fontFamily.black,
          fontSize: typography.fontSize.lg,
          color: colors.gray[900],
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="board"
        options={{
          title: 'Board',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={TAB_ICONS.board[focused ? 'focused' : 'unfocused']} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'List',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={TAB_ICONS.list[focused ? 'focused' : 'unfocused']} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-day"
        options={{
          title: 'My Day',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={TAB_ICONS['my-day'][focused ? 'focused' : 'unfocused']} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={TAB_ICONS.messages[focused ? 'focused' : 'unfocused']} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={TAB_ICONS.more[focused ? 'focused' : 'unfocused']} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
