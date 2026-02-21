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
