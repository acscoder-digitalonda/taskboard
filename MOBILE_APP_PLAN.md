# TaskBoard Mobile App Plan — Android & iOS

## Executive Summary

Ship a native mobile app for iOS and Android using **Expo (React Native)** in a monorepo with the existing Next.js web app. Phase 1 adds PWA support to the web app immediately (2-3 weeks). Phase 2 builds the full native app with shared business logic (12-14 weeks). Total estimated timeline: **16 weeks** to both app stores.

---

## Why Expo / React Native (Not PWA-only, Capacitor, or Flutter)

| Factor | PWA | Capacitor | **Expo (React Native)** | Flutter |
|--------|-----|-----------|------------------------|---------|
| Code reuse | 95% | 85% (needs static export) | **35-50% (logic + types)** | 0% |
| App Store | No (Android only via PWABuilder) | Yes | **Yes** | Yes |
| Push (iOS) | Home Screen only | Full native | **Full native** | Full native |
| Offline | No background sync on iOS | Plugin-based | **PowerSync + SQLite** | PowerSync + SQLite |
| DnD quality | WebView touch | WebView touch | **Native gestures (60fps)** | Native (Impeller) |
| Learning curve | None | Low | **Medium (team knows TS/React)** | High (Dart) |
| Maintenance | 1 codebase | 1 + platform folders | **Shared logic + 2 UI layers** | 2 separate codebases |
| Time to ship | 2-4 weeks | 3-6 weeks | **12-14 weeks** | 14-20+ weeks |

**Decision**: Expo wins because:
1. Team already knows TypeScript + React — smallest learning curve of any native option
2. 35-50% code sharing (types, store, hooks, utils, Supabase client)
3. Best-in-class offline via PowerSync + Supabase
4. Native drag-and-drop (Reanimated v3 + Gesture Handler v2) far superior to WebView DnD
5. Full push notifications, biometrics, file system, camera
6. EAS Build/Submit automates App Store and Play Store pipeline
7. OTA updates push JS changes without app store review

**Capacitor rejected** because: TaskBoard has 8 server-side API routes incompatible with `output: 'export'`. The WebView-based Kanban drag-and-drop would feel sluggish on the core feature.

**Flutter rejected** because: 0% code sharing, separate language (Dart), double maintenance burden — unsustainable for a 2-3 person team.

---

## Phase 1: PWA (Weeks 1-3) — Ship Immediately

Add PWA capabilities to the existing Next.js app as a bridge while building the native app.

### Deliverables
- `src/app/manifest.ts` — Web app manifest (name, icons, theme color, display: standalone)
- Service worker via Serwist — asset caching, API response caching
- "Install TaskBoard" prompt for mobile Safari/Chrome users
- Push notification registration (Android full, iOS from Home Screen)
- Offline page fallback

### What This Gives Users
- Installable on home screen (looks/feels like an app)
- Works offline for cached views
- Push notifications on Android
- No app store needed — instant deployment

### Limitations (Why Phase 2 Exists)
- No iOS background sync (tasks edited offline won't sync until app is reopened)
- No App Store presence (discoverability, credibility)
- WebView-based drag-and-drop on Kanban board
- iOS aggressively evicts PWA state when backgrounded

---

## Phase 2: Expo Native App (Weeks 3-16)

### Architecture: Monorepo with Shared Packages

```
taskboard/
├── packages/
│   └── shared/                    # Shared business logic (NO React UI)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types/
│           │   └── index.ts       # All TypeScript interfaces
│           ├── store/
│           │   ├── task-store.ts   # Task CRUD + observer pattern
│           │   ├── messaging-store.ts
│           │   └── notification-store.ts
│           ├── utils/
│           │   ├── format.ts      # formatDue, isOverdue, isDueToday
│           │   ├── status.ts      # STATUS_LABELS, STATUS_COLORS
│           │   └── users.ts       # getUserById, getProjectById
│           ├── hooks/
│           │   ├── useTasks.ts    # useSyncExternalStore hooks
│           │   ├── useProjects.ts
│           │   ├── useFilters.ts
│           │   └── useMyDayTasks.ts
│           ├── supabase/
│           │   └── client.ts      # Platform-agnostic Supabase setup
│           └── data/
│               └── seed.ts        # USERS, PROJECTS, TASKS
│
├── apps/
│   ├── web/                       # Existing Next.js app
│   │   ├── next.config.ts
│   │   ├── src/
│   │   │   ├── app/              # App Router pages
│   │   │   ├── components/       # Web-specific React components
│   │   │   └── lib/              # → imports from @taskboard/shared
│   │   └── ...
│   │
│   └── mobile/                    # NEW: Expo app
│       ├── app.json              # Expo config
│       ├── app/                  # Expo Router (file-based routing)
│       │   ├── _layout.tsx       # Root layout + navigation
│       │   ├── (auth)/
│       │   │   └── login.tsx     # Login screen
│       │   ├── (tabs)/
│       │   │   ├── _layout.tsx   # Bottom tab navigator
│       │   │   ├── board.tsx     # Kanban board
│       │   │   ├── list.tsx      # Task list
│       │   │   ├── my-day.tsx    # My Day dashboard
│       │   │   ├── messages.tsx  # Messaging
│       │   │   └── more.tsx      # Hub, Projects, Settings
│       │   └── task/
│       │       └── [id].tsx      # Task detail (modal stack)
│       ├── components/           # Native UI components
│       │   ├── TaskCard.tsx
│       │   ├── KanbanBoard.tsx
│       │   ├── TaskListItem.tsx
│       │   ├── ChatBubble.tsx
│       │   ├── FilterChips.tsx
│       │   ├── StatusBadge.tsx
│       │   ├── UserAvatar.tsx
│       │   └── DraftComposer.tsx
│       ├── theme/
│       │   └── tokens.ts         # Design tokens matching web
│       └── utils/
│           └── notifications.ts  # Push notification setup
│
├── package.json                   # Workspace root
├── turbo.json                     # Turborepo config
└── tsconfig.base.json            # Shared TS config
```

### Shared Code Analysis

| File | Lines | Shareable? | Notes |
|------|-------|-----------|-------|
| `types/index.ts` | 307 | **YES** (100%) | Pure TypeScript interfaces, no dependencies |
| `lib/utils.ts` | 60 | **YES** (100%) | Pure date/string formatting functions |
| `lib/data.ts` | 207 | **YES** (100%) | Seed data objects, universal JS |
| `lib/supabase.ts` | 20 | **YES** (95%) | Abstract `process.env` → platform config |
| `lib/hooks.ts` | 106 | **YES** (100%) | `useSyncExternalStore` works in React Native |
| `lib/store.ts` | 655 | **PARTIAL** (80%) | Remove `"use client"`, inject Supabase |
| `lib/messaging-store.ts` | 651 | **PARTIAL** (80%) | Same as store.ts |
| `lib/notifications.ts` | 157 | **PARTIAL** (70%) | Extract pure logic, native push is separate |

**Total shareable**: ~1,200+ lines of business logic, types, and hooks.

---

### Mobile Navigation Structure

```
Bottom Tabs:
├── Board      → Kanban with native drag-and-drop
├── List       → Scrollable task list with sort/filter
├── My Day     → Personal dashboard (today + upcoming)
├── Messages   → Channel list → Chat thread
└── More       → Hub, Projects, Search, Notifications, Settings

Modal Stack (overlays any tab):
├── Task Detail    → Full editor (status, assignee, due, notes, files)
├── New Task       → Quick create (chat-style input)
├── Draft Composer → Email draft review/edit/send
├── Search         → Global search
└── Project Detail → Project settings + files
```

### Key Mobile-Specific Considerations

#### 1. Drag-and-Drop (Kanban Board)
- **Library**: Custom implementation with `react-native-reanimated` v3 + `react-native-gesture-handler` v2
- **Why custom**: Existing kanban DnD libraries use outdated Reanimated V1
- **Behavior**: Long-press to pick up card → drag across columns → haptic feedback on drop
- **Performance**: Animations run on native thread (not JS thread) — 60fps guaranteed
- **Estimated effort**: 2-3 weeks for polished implementation

#### 2. Offline-First with PowerSync
- **Stack**: PowerSync + Supabase + SQLite (embedded on device)
- **How it works**:
  1. All reads/writes go to local SQLite first → instant UI response
  2. PowerSync syncs changes to Supabase Postgres in background
  3. Conflict resolution: "last write wins" for most fields, server-side logic for status conflicts
- **What works offline**: Create tasks, edit tasks, move tasks, mark done, add notes
- **What requires connectivity**: Send emails, file uploads, real-time chat
- **Sync indicator**: Show green/yellow/red dot in header (synced/syncing/offline)

#### 3. Push Notifications
- **Architecture**: Supabase DB trigger → Edge Function → FCM HTTP v1 API → device
- **Expo integration**: `expo-notifications` abstracts FCM (Android) + APNs (iOS)
- **Token storage**: FCM token stored in user's Supabase profile on app launch
- **Notification types**:
  - Task assigned to you
  - Task status changed
  - New message in your channels
  - Email draft ready for review
  - Task overdue reminder

#### 4. Authentication
- **Supabase Auth** with `expo-auth-session` for Google OAuth
- **Token storage**: `expo-secure-store` (encrypted keychain on iOS, encrypted SharedPreferences on Android)
- **Biometric unlock**: `expo-local-authentication` for Face ID / fingerprint after initial login
- **Session handling**: Custom retry logic for refresh tokens (handles offline → online transitions)

#### 5. File Management
- **Upload**: `expo-image-picker` for camera/gallery, `expo-document-picker` for files
- **Storage**: Upload to Supabase Storage with progress tracking
- **Offline**: Queue file uploads for when connectivity returns
- **Preview**: In-app image viewer, PDF viewer via `react-native-pdf`

---

### Design Token Mapping (Web → Native)

```typescript
// apps/mobile/theme/tokens.ts
export const colors = {
  primary: {
    500: '#00BCD4',  // cyan-500
    600: '#0097A7',  // cyan-600
    100: '#E0F7FA',  // cyan-100
    50:  '#E0F7FA',  // cyan-50
    200: '#B2EBF2',  // cyan-200
  },
  secondary: {
    500: '#E91E63',  // magenta-500
    600: '#C2185B',  // magenta-600
    100: '#FCE4EC',  // magenta-100
  },
  tertiary: {
    500: '#FFD600',  // yellow-500
    100: '#FFF9C4',  // yellow-100
  },
  status: {
    backlog: '#9E9E9E',
    doing:   '#00BCD4',
    waiting: '#FFD600',
    done:    '#4CAF50',
  },
  gray: {
    50:  '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    700: '#616161',
    900: '#212121',
  },
} as const;

export const typography = {
  fontFamily: {
    regular: 'Roboto_400Regular',
    medium:  'Roboto_500Medium',
    bold:    'Roboto_700Bold',
    black:   'Roboto_900Black',
  },
  fontSize: {
    xs:   10,  // Micro labels, badges
    sm:   14,  // Small text
    base: 16,  // Body text
    lg:   18,  // Section headers
    xl:   20,  // Page headers
    '2xl': 24, // Large titles
    '3xl': 30, // Hero titles
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,    // Cards, buttons
  lg: 12,   // Inputs
  xl: 16,   // Chat bubbles
  full: 999, // Badges, avatars
} as const;
```

---

### Screen-by-Screen Mobile Design

#### Board View (Kanban)
- **Layout**: Horizontal scroll through 4 columns (Backlog → Doing → Waiting → Done)
- **Cards**: Simplified TaskCard — title, assignee avatar, due date, priority dot
- **Interaction**: Long-press → card lifts with shadow + haptic → drag across columns
- **Column header**: Status dot + label + count badge (sticky at top)
- **Empty state**: "Drop tasks here" with dashed border
- **FAB**: "+" button in bottom-right to quick-create task

#### List View
- **Layout**: FlatList with section headers (grouped by status or sorted by selected key)
- **Row**: Color bar (left) + title + assignee badge + status badge + due date
- **Swipe actions**: Swipe right → mark done (green), swipe left → edit (cyan)
- **Sort chips**: Horizontal scroll bar at top (Priority, Title, Due, Status)
- **Pull to refresh**: Standard pull-down gesture

#### My Day
- **Layout**: ScrollView with two sections
- **Today section**: Top 3 priority tasks with large cards, drag to reorder
- **Upcoming section**: Compact list of future tasks
- **Empty state**: Checkmark animation + "All clear for today!"
- **Quick actions**: Tap task → modal detail, long-press → quick status change

#### Messages
- **Channel list**: Avatar + name + last message preview + timestamp + unread badge
- **Chat thread**: FlatList (inverted) with message bubbles
  - Regular messages: gray bubble (others), cyan bubble (self)
  - Email messages: Blue "📧 Email" badge with sender/subject
  - Sent emails: Green "✅ Sent" badge
- **Input**: Text input + send button + attachment icon
- **Reply to email**: "Reply" button on email messages → opens DraftComposer modal

#### Hub (More tab)
- **Project cards**: Grid of project cards with color accent, task counts
- **Draft Replies**: List of pending email drafts with "Review" button
- **Email Threads**: Grouped by project with expand/collapse
- **Quick actions**: Tap project → project detail, tap draft → DraftComposer

#### Task Detail (Modal)
- **Layout**: Full-screen modal with scroll
- **Header**: Task title (editable) + close button
- **Fields**: Status picker, Assignee picker, Project picker, Priority slider, Due date picker
- **Sections**: Notes (rich text), Files (grid), Links (list)
- **Actions**: Delete (with confirmation), Mark done
- **Auto-save**: Debounced save on field change (no save button needed)

---

### Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "react-native": "0.76.x",
    "react": "19.x",

    "@supabase/supabase-js": "^2.x",
    "@powersync/react-native": "^1.x",

    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.20.0",

    "expo-notifications": "~0.29.0",
    "expo-secure-store": "~14.0.0",
    "expo-auth-session": "~6.0.0",
    "expo-local-authentication": "~15.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-document-picker": "~13.0.0",
    "expo-haptics": "~14.0.0",

    "@expo-google-fonts/roboto": "^0.2.0",
    "lucide-react-native": "^0.x",

    "@react-navigation/native": "^7.x",
    "@react-navigation/bottom-tabs": "^7.x"
  }
}
```

---

### Build & Deploy Pipeline

```
EAS Build Pipeline:
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│  git push main  │────▶│  EAS Build   │────▶│  EAS Submit   │
│                 │     │  (cloud)     │     │  (auto)       │
└─────────────────┘     │  iOS + Android│    │  App Store    │
                        └──────────────┘     │  Play Store   │
                                             └───────────────┘

OTA Updates (JS-only changes):
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│  eas update     │────▶│  EAS Update  │────▶│  Users get    │
│  --branch prod  │     │  (CDN)       │     │  update on    │
└─────────────────┘     └──────────────┘     │  next launch  │
                                             └───────────────┘
```

### App Store Requirements Checklist

#### iOS (Apple)
- [ ] Apple Developer Account ($99/year)
- [ ] App icons (1024x1024 + all sizes)
- [ ] Screenshots (6.7", 6.5", 5.5" iPhone + iPad)
- [ ] Privacy policy URL
- [ ] App Review description
- [ ] Push notification entitlement
- [ ] Sign in with Apple (if using social login)

#### Android (Google Play)
- [ ] Google Play Developer Account ($25 one-time)
- [ ] App icons (512x512)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots (phone + tablet)
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Data safety section

---

### Timeline

| Week | Milestone | Details |
|------|-----------|---------|
| 1-2 | PWA + Monorepo setup | Add PWA to web app, set up Turborepo workspace, extract shared packages |
| 3-4 | Expo scaffold + Auth | Expo project, Expo Router navigation, Supabase Auth + SecureStore |
| 5-6 | Core screens | Task List, My Day, Task Detail modal |
| 7-9 | Kanban board | Custom DnD with Reanimated v3, column scroll, haptic feedback |
| 10 | Messaging | Channel list, chat thread, email badges |
| 11 | Hub + Email Drafts | Project hub, draft composer, email send |
| 12 | Offline + Push | PowerSync integration, push notification pipeline |
| 13 | Polish | Animations, loading states, error handling, accessibility |
| 14 | Testing + Submission | Device testing, TestFlight beta, Play Store internal track |
| 15-16 | App Store review + Launch | Address review feedback, public release |

---

### Cost Estimate (First Year)

| Item | Cost |
|------|------|
| Apple Developer Program | $99/year |
| Google Play Developer | $25 one-time |
| EAS Build (Starter) | $19/month = $228/year |
| PowerSync (Free tier) | $0 (up to 1GB sync) |
| **Total Year 1** | **~$352** |

---

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Kanban DnD taking too long | Start with simpler list-based status change (swipe), add full DnD in v1.1 |
| PowerSync learning curve | Start without offline, add PowerSync in v1.1 after core app works |
| App Store rejection | Follow Apple HIG closely, ensure all required metadata is ready before submission |
| Supabase Auth offline issues | Implement custom retry logic for refresh tokens, cache auth state locally |
| Scope creep | Ship MVP with Board + List + Task Detail + Messages. Add Hub/Email/Search in v1.1 |

### MVP (v1.0) vs Full Feature (v1.1)

**v1.0 MVP** (Weeks 3-14):
- ✅ Board view with drag-and-drop
- ✅ List view with sort/filter
- ✅ Task detail (view + edit all fields)
- ✅ My Day dashboard
- ✅ Messages (channels + chat)
- ✅ Push notifications
- ✅ Auth (Google OAuth + biometric)
- ✅ Basic offline (cached reads)

**v1.1** (Post-launch, 4-6 weeks):
- ⏳ Full offline-first with PowerSync
- ⏳ Email draft composer + send
- ⏳ Hub (project overview, email threads)
- ⏳ Search
- ⏳ File upload from camera/gallery
- ⏳ Notification preferences
- ⏳ Widget (iOS/Android) for My Day tasks

---

## Implementation Guide — Step by Step

### Step 1: Monorepo Setup (Day 1-2)

Run these commands from the existing `taskboard/` root:

```bash
# 1. Install Turborepo
npm install -D turbo

# 2. Create workspace structure
mkdir -p packages/shared/src/{types,store,utils,hooks,supabase}
mkdir -p apps/mobile

# 3. Move existing Next.js app into apps/web
mkdir -p apps/web
git mv src apps/web/src
git mv public apps/web/public
git mv next.config.ts apps/web/
git mv tsconfig.json apps/web/
git mv postcss.config.mjs apps/web/
# Keep package.json at root as workspace root

# 4. Create workspace root package.json
# (replaces existing — see template below)
```

**Root `package.json`**:
```json
{
  "name": "taskboard",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.x",
    "typescript": "^5.9"
  }
}
```

**`turbo.json`**:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": { "dependsOn": ["^build"] }
  }
}
```

### Step 2: Extract Shared Package (Day 2-4)

**`packages/shared/package.json`**:
```json
{
  "name": "@taskboard/shared",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.95"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

Files to move into `packages/shared/src/`:

| Source (current) | Destination | Changes needed |
|-----------------|-------------|----------------|
| `src/types/index.ts` | `types/index.ts` | None (pure types) |
| `src/lib/utils.ts` | `utils/index.ts` | Remove `import { store }` — accept users/projects as params |
| `src/lib/hooks.ts` | `hooks/index.ts` | None (`useSyncExternalStore` works in RN) |
| `src/lib/store.ts` | `store/task-store.ts` | Remove `"use client"`, inject supabase as param |
| `src/lib/messaging-store.ts` | `store/messaging-store.ts` | Same pattern |
| `src/lib/rate-limit.ts` | `utils/rate-limit.ts` | Server-only, but logic is portable |

**Key refactoring pattern** — make `store.ts` accept a Supabase client:

```typescript
// packages/shared/src/store/task-store.ts
import { SupabaseClient } from "@supabase/supabase-js";

export function createTaskStore(supabase: SupabaseClient) {
  let tasks: Task[] = [];
  // ... same logic but uses injected supabase instead of import
  return {
    getTasks: () => tasks,
    subscribe: (fn: Listener) => { /* ... */ },
    addTask: (task: Omit<Task, "id" | "created_at" | "updated_at">) => { /* ... */ },
    // ...all other methods
  };
}
```

Then both web and mobile create their own instance:
```typescript
// apps/web/src/lib/store.ts
import { createTaskStore } from "@taskboard/shared/store/task-store";
import { supabase } from "./supabase";
export const store = createTaskStore(supabase);

// apps/mobile/src/store.ts
import { createTaskStore } from "@taskboard/shared/store/task-store";
import { supabase } from "./supabase";
export const store = createTaskStore(supabase);
```

### Step 3: Create Expo App (Day 4-5)

```bash
cd apps/
npx create-expo-app mobile --template tabs
cd mobile

# Install core dependencies
npx expo install expo-router react-native-reanimated react-native-gesture-handler \
  react-native-screens react-native-safe-area-context @react-navigation/native \
  @react-navigation/bottom-tabs expo-haptics expo-secure-store expo-auth-session \
  expo-notifications expo-local-authentication expo-image-picker expo-document-picker

# Install Supabase
npm install @supabase/supabase-js

# Install fonts
npx expo install @expo-google-fonts/roboto expo-font

# Install icons
npm install lucide-react-native react-native-svg

# Link shared package
# (already handled by workspace — import as @taskboard/shared)
```

**`apps/mobile/app.json`** (key fields):
```json
{
  "expo": {
    "name": "TaskBoard",
    "slug": "taskboard",
    "version": "1.0.0",
    "scheme": "taskboard",
    "platforms": ["ios", "android"],
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#00BCD4"
    },
    "ios": {
      "bundleIdentifier": "com.yourteam.taskboard",
      "supportsTablet": true,
      "infoPlist": {
        "NSFaceIDUsageDescription": "Use Face ID to unlock TaskBoard"
      }
    },
    "android": {
      "package": "com.yourteam.taskboard",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#00BCD4"
      }
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        { "icon": "./assets/notification-icon.png", "color": "#00BCD4" }
      ]
    ]
  }
}
```

### Step 4: Native Supabase Auth (Day 5-7)

```typescript
// apps/mobile/src/supabase.ts
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

### Step 5: Navigation Skeleton (Day 7-9)

```typescript
// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { LayoutGrid, List, Sun, MessageSquare, Menu } from "lucide-react-native";
import { colors } from "../../theme/tokens";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarLabelStyle: { fontFamily: "Roboto_500Medium", fontSize: 11 },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="board"
        options={{
          title: "Board",
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: "List",
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-day"
        options={{
          title: "My Day",
          tabBarIcon: ({ color, size }) => <Sun color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

---

## Native Component Mapping (Web → Mobile)

Each web component has a native counterpart. The component _logic_ (hooks, state) is shared; only the _UI layer_ (JSX/styles) is rewritten.

| Web Component | Native Component | Key Differences |
|--------------|-----------------|-----------------|
| `BoardView.tsx` | `KanbanBoard.tsx` | Horizontal ScrollView + Reanimated DnD |
| `ListView.tsx` | `TaskList.tsx` | FlatList + swipe actions (react-native-swipeable-item) |
| `MyDayView.tsx` | `MyDayScreen.tsx` | ScrollView + Reanimated sort |
| `TaskCard.tsx` | `TaskCard.tsx` | Pressable + native shadows |
| `TaskDetailDrawer.tsx` | `TaskDetailModal.tsx` | Modal stack screen, not drawer |
| `FilterBar.tsx` | `FilterChips.tsx` | Horizontal FlatList of chip Pressables |
| `ChatPanel.tsx` | `ChatInput.tsx` | KeyboardAvoidingView + TextInput |
| `ChannelChat.tsx` | `ChatThread.tsx` | Inverted FlatList for messages |
| `MessagingView.tsx` | `messages.tsx` (tab) | Stack navigator: list → thread |
| `ProjectManager.tsx` | `ProjectSettings.tsx` | Screen in More tab stack |
| `SearchPanel.tsx` | `SearchScreen.tsx` | TextInput + FlatList results |
| `NotificationBell.tsx` | `NotificationScreen.tsx` | Full screen (not dropdown) |
| `Toast.tsx` | `Toast.tsx` | react-native-toast-message |
| `ErrorBoundary.tsx` | `ErrorBoundary.tsx` | Same pattern, RN-compatible |
| `LoginPage.tsx` | `login.tsx` | expo-auth-session for OAuth |

---

## Testing Strategy for Mobile

### Unit Tests (Shared package — Vitest)
- All tests in `packages/shared/` run with Vitest (same as current)
- Store logic, utils, hooks — already covered by existing 43 tests
- Run with `turbo run test --filter=@taskboard/shared`

### Component Tests (Mobile — Jest + React Native Testing Library)
```bash
npm install -D jest @testing-library/react-native jest-expo
```

Test key interactions:
- Task card press → navigation to detail
- Filter chip toggle → list filtering
- Swipe to complete → status update
- Chat send → message appears

### E2E Tests (Detox or Maestro)
Recommend **Maestro** for mobile E2E — simpler YAML-based tests:

```yaml
# .maestro/login-and-create-task.yaml
appId: com.yourteam.taskboard
---
- launchApp
- tapOn: "Sign in with Google"
- waitForAnimationToEnd
- tapOn: "Board"
- tapOn: "+"
- inputText: "New task from E2E test"
- tapOn: "Create"
- assertVisible: "New task from E2E test"
```

### Test Matrix
| Layer | Tool | What it tests |
|-------|------|--------------|
| Shared logic | Vitest | Store, hooks, utils, types |
| Mobile components | Jest + RNTL | Component rendering, interactions |
| Mobile E2E | Maestro | Full user flows on device/simulator |
| Web (existing) | Vitest | Same as current |

---

## CI/CD with EAS

**`eas.json`**:
```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your@email.com", "ascAppId": "123456789" },
      "android": { "serviceAccountKeyPath": "./play-store-key.json" }
    }
  }
}
```

**GitHub Actions workflow** (`.github/workflows/mobile.yml`):
```yaml
name: Mobile Build
on:
  push:
    branches: [main]
    paths: ['apps/mobile/**', 'packages/shared/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test --workspace=packages/shared
      - run: npm run test --workspace=apps/mobile

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: cd apps/mobile && eas build --platform all --non-interactive

  submit:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd apps/mobile && eas submit --platform all --non-interactive
```

---

## Supabase Edge Functions for Push Notifications

```typescript
// supabase/functions/push-notification/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { user_id, title, body, data } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get user's push token
  const { data: profile } = await supabase
    .from("user_preferences")
    .select("push_token")
    .eq("user_id", user_id)
    .single();

  if (!profile?.push_token) return new Response("No token", { status: 200 });

  // Send via Expo Push API
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: profile.push_token,
      title,
      body,
      data,
      sound: "default",
      badge: 1,
    }),
  });

  return new Response(JSON.stringify(await response.json()), { status: 200 });
});
```

**Database trigger** (add to schema):
```sql
-- Trigger push notifications on task assignment
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'user_id', NEW.assignee_id,
        'title', 'Task assigned to you',
        'body', NEW.title,
        'data', jsonb_build_object('task_id', NEW.id, 'type', 'task_assigned')
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_task_assigned
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();
```

---

## Quick-Start Checklist

When you're ready to begin building:

- [ ] Create Apple Developer account ($99/yr)
- [ ] Create Google Play Developer account ($25 one-time)
- [ ] Create EAS account at expo.dev
- [ ] Set up Turborepo monorepo (Step 1 above)
- [ ] Extract shared package (Step 2 above)
- [ ] Verify web app still builds after restructure
- [ ] Create Expo app (Step 3 above)
- [ ] Wire up Supabase auth with SecureStore (Step 4)
- [ ] Build navigation skeleton (Step 5)
- [ ] Implement first screen (List view — simplest)
- [ ] Test on physical device with Expo Go
- [ ] Build remaining screens one at a time
- [ ] Set up EAS Build for both platforms
- [ ] Internal testing round (TestFlight + Play Store internal track)
- [ ] App store submission
