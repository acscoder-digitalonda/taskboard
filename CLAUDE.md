# TaskBoard — Design System Rules

## Rules

1. **Commit after every major change** with a clear, descriptive commit message. Never let more than ~15 minutes of work go uncommitted. This protects against crashes, power loss, and makes it easy to roll back any change with `git revert`.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript 5.9
- **Styling**: Tailwind CSS 4 (utility-first, PostCSS)
- **Drag & Drop**: @dnd-kit/core + @dnd-kit/sortable
- **Icons**: lucide-react 0.563
- **Backend**: Supabase (PostgreSQL + Realtime + Auth + Storage)
- **Email**: googleapis (Gmail API via Service Account domain-wide delegation)
- **Font**: Roboto (300, 400, 500, 700, 900) from Google Fonts

## Token Definitions

### Colors (defined in `src/app/globals.css` `@theme` block)

```css
@theme {
  --color-cyan-500: #00BCD4;    /* Primary action */
  --color-cyan-600: #0097A7;    /* Hover/active */
  --color-cyan-100: #E0F7FA;    /* Light background */
  --color-cyan-50: #E0F7FA;     /* Ultra-light */
  --color-cyan-200: #B2EBF2;    /* Accent ring */
  --color-cyan-300: #80DEEA;    /* Medium */
  --color-magenta-500: #E91E63; /* Secondary action */
  --color-magenta-600: #C2185B; /* Secondary hover */
  --color-magenta-100: #FCE4EC; /* Light secondary */
  --color-yellow-500: #FFD600;  /* Tertiary/waiting */
  --color-yellow-100: #FFF9C4;  /* Light tertiary */
  --font-sans: "Roboto", system-ui, sans-serif;
}
```

### Status Colors (from `src/lib/utils.ts`)

| Status   | Color     | Hex       |
|----------|-----------|-----------|
| Backlog  | Gray      | `#9E9E9E` |
| Doing    | Cyan      | `#00BCD4` |
| Waiting  | Yellow    | `#FFD600` |
| Done     | Green     | `#4CAF50` |

### Extended Palette (projects/users)

`#9C27B0` (Purple), `#FF5722` (Deep Orange), `#2196F3` (Blue), `#FF9800` (Orange), `#795548` (Brown), `#607D8B` (Blue Gray)

### Typography Scale

| Class       | Size  | Usage                     |
|-------------|-------|---------------------------|
| `text-xs`   | 10px  | Micro labels, badges      |
| `text-sm`   | 14px  | Small text, badges        |
| `text-base` | 16px  | Body text                 |
| `text-lg`   | 18px  | Section headers           |
| `text-xl`   | 20px  | Page headers              |
| `text-2xl`  | 24px  | Large titles              |
| `text-3xl`  | 30px  | Hero titles               |

### Font Weight Usage

- `font-black` (900): Logo, main titles
- `font-bold` (700): Section headers, labels
- `font-semibold` (600): Badge text, strong emphasis
- `font-medium` (500): Regular body text
- `font-normal` (400): Body text, form inputs

### Spacing

Standard Tailwind 4px base. Common patterns:
- Component padding: `p-3` or `p-4`
- Section margin: `mb-6`, `mb-8`
- Card gaps: `gap-2`, `gap-3`
- Grid gaps: `gap-4`, `gap-6`

### Border Radius

- Buttons/inputs: `rounded-lg` (8px) or `rounded-xl` (12px)
- Cards: `rounded-lg` (8px)
- Badges: `rounded-full`
- Chat bubbles: `rounded-2xl` (16px)

### Z-Index Stacking

| Value    | Element                |
|----------|------------------------|
| `z-10`   | Close buttons          |
| `z-50`   | Header, mobile FAB     |
| `z-[90]` | Task detail drawer     |
| `z-[100]`| Project manager modal  |

## Component Architecture

All components are **client components** (`"use client"`) in `src/components/`.

### Core Components

| Component               | File                          | Purpose                              |
|-------------------------|-------------------------------|--------------------------------------|
| `TaskCard`              | `TaskCard.tsx`                | Core task display unit               |
| `BoardView`             | `BoardView.tsx`               | Kanban board (4 columns, dnd-kit)    |
| `ListView`              | `ListView.tsx`                | Sortable table/card list             |
| `MyDayView`             | `MyDayView.tsx`               | Personal dashboard (today/upcoming)  |
| `TaskDetailDrawer`      | `TaskDetailDrawer.tsx`        | Full task editor (right drawer)      |
| `FilterBar`             | `FilterBar.tsx`               | Filter controls (user/project/status)|
| `ChatPanel`             | `ChatPanel.tsx`               | Conversational task creation         |
| `ProjectManager`        | `ProjectManager.tsx`          | Project CRUD modal                   |
| `MessagingView`         | `MessagingView.tsx`           | Messages + Hub container (split pane)|
| `ChannelChat`           | `ChannelChat.tsx`             | Chat thread with email badges        |
| `CommsHub`              | `CommsHub.tsx`                | Project hub, drafts, email threads   |
| `EmailDraftComposer`    | `EmailDraftComposer.tsx`      | Draft editor (To/Subj/Body + Send)   |
| `NotificationBell`      | `NotificationBell.tsx`        | Notification dropdown with badges    |
| `SearchModal`           | `SearchModal.tsx`             | Global search across tasks/messages  |
| `LoginPage`             | `LoginPage.tsx`               | User selection / auth gate           |

### Styling Patterns

**Dynamic colors** (user/project colors applied via inline `style`):
```tsx
style={{ backgroundColor: user?.color || "#ccc" }}
style={{ borderLeft: `3px solid ${user?.color}` }}
```

**Conditional classes**:
```tsx
className={`${isActive ? "bg-cyan-50 ring-2 ring-cyan-200" : "bg-gray-50"}`}
```

**Hover actions (desktop only)**:
```tsx
className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
```

**Responsive hiding**:
```tsx
className="hidden sm:inline"    // Show on tablet+
className="lg:hidden"           // Hide on desktop
```

### Responsive Breakpoints

- `sm` (640px): Tablet and up
- `md` (768px): Desktop and up
- `lg` (1024px): Large desktop and up

## Icon System (lucide-react)

### Size Convention

| Size | Usage                           |
|------|---------------------------------|
| 10px | Micro indicators (clock, flag)  |
| 12px | Small info icons, save buttons  |
| 14px | Small buttons, section headers  |
| 16px | Standard buttons, navigation    |
| 18px | Large headers, primary actions  |
| 20px | Dialog headers                  |

### Icon Color Convention

- Default: `text-gray-300` to `text-gray-500`
- Hover: `hover:text-gray-600`, `hover:text-cyan-600`
- Contextual: `text-cyan-600` (active), `text-yellow-500` (warning), `text-red-500` (danger)

### Common Icons

- Navigation: `LayoutGrid`, `List`, `Sun`, `FolderOpen`
- Actions: `CheckCircle2`, `ArrowRight`, `GripVertical`, `Trash2`, `Edit3`, `Plus`, `X`
- Info: `Clock`, `Flag`, `Link2`, `ExternalLink`, `StickyNote`
- Chat: `MessageSquare`, `User`, `Bot`, `Send`

## State Management

Simple **observer pattern** using `useSyncExternalStore`:
- Source of truth: `src/lib/store.ts`
- React hooks: `src/lib/hooks.ts` (`useTasks`, `useProjects`, `useFilters`)
- Types: `src/types/index.ts` (matches Supabase schema)
- Data flow: `store → hooks → components → user actions → store`

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout, metadata, fonts
│   ├── page.tsx                # Main app shell (header, views, modals)
│   ├── globals.css             # Global styles, @theme tokens
│   └── api/
│       └── email/
│           ├── drafts/
│           │   ├── route.ts        # POST create, GET list drafts
│           │   └── [id]/route.ts   # PATCH edit, DELETE discard draft
│           ├── send/route.ts       # POST send draft via Gmail API
│           └── inbound/route.ts    # POST webhook for incoming emails
├── components/                 # All React components (use client)
│   ├── BoardView.tsx
│   ├── ChannelChat.tsx         # Chat thread with email badges
│   ├── ChatPanel.tsx
│   ├── CommsHub.tsx            # Project hub + drafts + email threads
│   ├── EmailDraftComposer.tsx  # Draft review/edit/send modal
│   ├── FilterBar.tsx
│   ├── ListView.tsx
│   ├── LoginPage.tsx           # User selection auth gate
│   ├── MessagingView.tsx       # Messages + Hub split pane
│   ├── MyDayView.tsx
│   ├── NotificationBell.tsx    # Notifications dropdown
│   ├── ProjectManager.tsx
│   ├── SearchModal.tsx         # Global search modal
│   ├── TaskCard.tsx
│   └── TaskDetailDrawer.tsx
├── lib/
│   ├── store.ts            # State management (observer pattern)
│   ├── hooks.ts            # Custom React hooks (useTasks, useMyDayTasks, etc.)
│   ├── utils.ts            # Utilities (formatDue, STATUS_COLORS)
│   ├── gmail.ts            # Gmail API client (service account auth, send)
│   └── data.ts             # Seed data (USERS, PROJECTS, TASKS)
├── supabase/
│   ├── schema-v4-gmail.sql # email_drafts table, projects.client_emails
│   └── ...                 # Other schema files
└── types/
    └── index.ts            # TypeScript interfaces (Task, EmailDraft, etc.)
```

## Gmail Integration

- **Service Account**: Configured via `GOOGLE_SERVICE_ACCOUNT_JSON` env var
- **Domain-wide Delegation**: Authorized for `gmail.send` scope
- **Send-as**: Configured via `GMAIL_SEND_AS` env var (impersonated via service account)
- **Team Name**: Configured via `NEXT_PUBLIC_TEAM_NAME` env var (used in auto-reply signatures)
- **Flow**: Inbound email → webhook → auto-draft → reviewer approves → clicks Send → Gmail API
- **Tables**: `email_drafts` (status: draft/approved/sent/failed)
- **Env vars**: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GMAIL_SEND_AS`, `NEXT_PUBLIC_TEAM_NAME`

## When Implementing Figma Designs

1. **Use Tailwind utilities** — never write raw CSS except in `globals.css` `@theme`
2. **Use existing color tokens** — cyan for primary, magenta for secondary, yellow for tertiary
3. **Apply dynamic colors via inline `style`** for user/project colors
4. **Use lucide-react** for all icons — match size conventions above
5. **Follow responsive patterns** — mobile-first, `sm:` / `md:` / `lg:` breakpoints
6. **All new components** go in `src/components/` as `"use client"` modules
7. **Types** go in `src/types/index.ts`
8. **Max container width**: `max-w-[1600px] mx-auto`
9. **Card pattern**: `bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-all`
10. **Button pattern**: `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors`
11. **Focus ring**: `focus:ring-2 focus:ring-cyan-200 focus:outline-none`
12. **Gradient accent**: `linear-gradient(135deg, #00BCD4 0%, #E91E63 100%)` for brand elements
