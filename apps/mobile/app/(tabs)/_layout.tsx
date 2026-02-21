import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../../theme/tokens';
// Use simple SVG-like icons via Text since lucide-react-native may not resolve
// We'll use unicode/emoji as fallback icons

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    board: '▦',
    list: '≡',
    'my-day': '☀',
    messages: '💬',
    more: '⋯',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? colors.primary[500] : colors.gray[400] }}>
      {icons[name] || '•'}
    </Text>
  );
}

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
          tabBarIcon: ({ focused }) => <TabIcon name="board" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'List',
          tabBarIcon: ({ focused }) => <TabIcon name="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-day"
        options={{
          title: 'My Day',
          tabBarIcon: ({ focused }) => <TabIcon name="my-day" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ focused }) => <TabIcon name="messages" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused }) => <TabIcon name="more" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
