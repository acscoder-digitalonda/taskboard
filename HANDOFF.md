# TaskBoard — Comprehensive App Breakdown & QA Handoff

> Generated: 2026-02-22
> Purpose: Full reference for QA, debugging, and onboarding new sessions

---

## 1. What TaskBoard Is

TaskBoard is a **team project management and communication platform** built for small teams (5-10 people). It combines:

- **Kanban task board** with drag-and-drop, priorities, due dates, and AI-powered task creation
- **Team messaging** with channels, DMs, file sharing, and search
- **Email integration** via Gmail API (inbound webhook + draft review + send)
- **WhatsApp notifications** via Twilio
- **AI assistant** (Claude Sonnet) for natural-language task parsing
- **Mobile app** (Expo/React Native) mirroring the web experience

Live at: **https://taskboard.digitalonda.com/**

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5.9 (strict mode) |
| Styling | Tailwind CSS 4 + custom @theme tokens |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Icons | lucide-react 0.563 |
| Backend | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| Email | googleapis (Gmail API, Service Account) |
| AI | @anthropic-ai/sdk (Claude Sonnet) |
| WhatsApp | Twilio |
| Mobile | Expo 53 + React Native 0.79 |
| Deployment | Coolify (self-hosted, Nixpacks) |
| Testing | Vitest (43 tests across 5 files) |
| Font | Roboto (Google Fonts) |

---

## 3. Monorepo Structure

```
taskboard/
├── apps/
│   ├── web/                    # Next.js web app (main)
│   │   ├── src/
│   │   │   ├── app/            # App Router pages + API routes
│   │   │   ├── components/     # 23 React client components
│   │   │   ├── lib/            # State management, hooks, utils, API clients
│   │   │   ├── types/          # TypeScript interfaces
│   │   │   └── __tests__/      # Vitest test suite
│   │   ├── public/             # Static assets
│   │   ├── .env.example        # Env var documentation
│   │   └── package.json        # Web app dependencies
│   └── mobile/                 # Expo/React Native app
│       ├── app/                # File-based routing (Expo Router)
│       ├── components/         # 5 shared mobile components
│       ├── lib/                # Supabase client + auth
│       └── theme/              # Design tokens
├── packages/
│   └── shared/                 # Shared types & utils
│       └── src/
│           ├── types/          # TypeScript interfaces (canonical)
│           └── utils/          # Shared utilities
├── supabase/                   # Database schema migrations
├── nixpacks.toml               # Coolify build config
├── CLAUDE.md                   # Design system rules
└── package.json                # Workspace root
```

---

## 4. All Features — Detailed Breakdown

### 4A. Task Management (Core)

**Components:** `BoardView.tsx`, `ListView.tsx`, `TaskCard.tsx`, `TaskDetailDrawer.tsx`

- **Kanban Board** — 4 status columns: Backlog, Doing, Waiting, Done
  - Drag-and-drop between columns via @dnd-kit
  - Cards show: title, assignee badge (colored), project badge, due date, priority flag
  - Collapsible columns with task counts
- **List View** — Sortable table with columns for title, assignee, project, status, due date, priority
  - Sort by any column (click header)
  - Filters persist between views
- **Task Detail Drawer** — Right-side slide-out panel (z-index 90)
  - Editable title, status dropdown, priority selector (1-4)
  - Assignee picker, project picker, due date picker
  - Structured sections (Goal, Scope, Deliverables, Notes)
  - Drive links, activity feed (updates), check-ins
  - Created via / created by metadata
  - Empty title shows red border validation hint
- **Task Cards** — Compact display with:
  - Priority flag (color-coded), assignee avatar, project badge
  - Due date with overdue highlighting (red for past due)
  - Drag handle for reordering

**State:** `store.ts` manages all tasks in memory with optimistic updates + Supabase sync.

### 4B. AI Task Creation (ChatPanel)

**Components:** `ChatPanel.tsx`
**API Route:** `/api/chat/parse`

- Bottom-right collapsible chat widget with gradient header
- User types natural language: "Draft proposal for ACME, assign to Katie, due tomorrow"
- **AI Flow** (primary):
  1. Shows "Parsing your task..." with spinner
  2. POST to `/api/chat/parse` with message + team users + projects
  3. Claude Sonnet extracts: title, assignee, project, due date, priority, status
  4. Shows preview card with confidence level (High/Medium/Low)
- **Regex Fallback** (if AI fails):
  - `parseTaskInput()` in store.ts
  - Matches patterns: `assign to NAME`, `@NAME`, `project:NAME`, `due today/tomorrow`
- User confirms → task created → notification sent to assignee
- Notification level selector: WhatsApp, In-app, or None

### 4C. My Day View

**Component:** `MyDayView.tsx`

- Personal dashboard showing "today's focus"
- Top 3 priority tasks due today or overdue
- Upcoming tasks section (next 7 days)
- Quick-complete checkboxes
- Motivational progress indicator

### 4D. Filtering

**Component:** `FilterBar.tsx`

- Filter by: assignee (multi-select), project (multi-select), status (multi-select)
- Filters apply across Board, List, and Search views
- Clear all button
- Filter state persists during session

### 4E. Global Search

**Component:** `SearchPanel.tsx`
**Library:** `search.ts`

- Modal overlay (z-index 100) triggered by Cmd+K or search icon
- Searches across: tasks, messages, files, channels
- Filter tabs: All, Tasks, Messages, Files, Channels
- Debounced search (300ms)
- Full-text search via PostgreSQL TSVECTOR
- "Load more" pagination (30 results per page)
- Focus trap for accessibility

### 4F. Team Messaging

**Components:** `MessagingView.tsx`, `ChannelChat.tsx`, `ChannelList.tsx`, `NewChannelForm.tsx`, `NewDMPicker.tsx`
**State:** `messaging-store.ts`, `messaging-hooks.ts`

- Split-pane layout: channel list (left) + chat thread (right)
- Channel types: public, private, direct message
- Features per channel:
  - Real-time messages via Supabase Realtime
  - File attachments (drag-drop or click to upload)
  - Email badges on messages (shows which messages were auto-generated from email)
  - Message reactions (emoji)
  - Reply threading
  - System messages (join/leave)
  - AI-generated messages (from OpenClaw agent)
- File upload with progress bar and error feedback
- Unread indicators and message counts

### 4G. Communications Hub

**Component:** `CommsHub.tsx`

- Project-centric view of all communications
- Tabs: Overview, Drafts, Email Threads
- Links channels to projects
- Shows email thread history per project

### 4H. Email Integration

**Components:** `EmailDraftComposer.tsx`
**API Routes:** `/api/email/drafts`, `/api/email/drafts/[id]`, `/api/email/send`, `/api/email/inbound`
**Library:** `gmail.ts`

- **Inbound**: Webhook receives emails → auto-creates draft reply → assigns to reviewer
- **Draft Workflow**: Draft → Review/Edit → Approve → Send
- **Outbound**: Gmail API via Service Account with domain-wide delegation
- **Threading**: In-Reply-To and References headers maintained
- Draft composer: To, Subject, Body (rich text) + Send button
- Draft status lifecycle: draft → approved → sent → failed

### 4I. Notifications

**Component:** `NotificationBell.tsx`
**API Routes:** `/api/notifications/send`, `/api/notifications/whatsapp`
**Library:** `notifications.ts`

- Header bell icon with unread count badge
- Dropdown showing recent notifications
- Types: task_assigned, task_updated, task_completed, mention, dm, channel_message, checkin_due, agent_report, email_ingested
- Channels: in-app (always), WhatsApp (optional via Twilio), email (optional)
- Mark as read on click

### 4J. Project Management

**Component:** `ProjectManager.tsx`

- Modal for CRUD operations on projects
- Color picker from predefined palette (random default)
- Project name editing
- Delete with confirmation
- z-index 100 (above everything else)

### 4K. File Management

**Components:** `FileUploadZone.tsx`, `FileList.tsx`, `ProjectFileBrowser.tsx`
**Library:** `files.ts`

- Drag-and-drop upload to Supabase Storage
- File previews (images, PDFs)
- Organized by project and channel
- Signed URLs (1-hour expiry)
- Search via TSVECTOR on file names

### 4L. Authentication

**Component:** `LoginPage.tsx`
**Library:** `auth.tsx`, `api-auth.ts`

- Google OAuth via Supabase Auth
- Auto-upserts user record on first login
- Bearer token auth for all API calls
- Dev bypass mode for local development
- Error feedback on sign-in failure

### 4M. Error Handling & Resilience

**Components:** `ErrorBoundary.tsx`, `Toast.tsx`

- React Error Boundary catches render crashes
- Toast notifications for success/error/info
- Optimistic updates with rollback on Supabase errors
- Store init failure shows user-visible error toast
- Graceful degradation: AI → regex, WhatsApp → silent fail

---

## 5. API Routes Reference

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/chat/parse` | POST | Bearer | AI task parsing via Claude Sonnet |
| `/api/email/drafts` | GET | Bearer | List email drafts |
| `/api/email/drafts` | POST | Bearer | Create new email draft |
| `/api/email/drafts/[id]` | PATCH | Bearer | Edit email draft |
| `/api/email/drafts/[id]` | DELETE | Bearer | Discard email draft |
| `/api/email/send` | POST | Bearer | Send approved draft via Gmail |
| `/api/email/inbound` | POST | Webhook | Receive inbound emails |
| `/api/notifications/send` | POST | Bearer/Webhook | Send notification (in-app + optional WhatsApp) |
| `/api/notifications/whatsapp` | POST | Bearer | Direct WhatsApp send |
| `/api/openclaw/ingest` | POST | Webhook | OpenClaw agent data ingestion |
| `/api/openclaw/report` | POST | Webhook | Agent activity reports |
| `/api/openclaw/summarize` | POST | Webhook | AI-generated summaries |

---

## 6. Database Tables (Supabase)

### Core
- `users` — team members (id, email, name, initials, color, avatar_url)
- `projects` — projects (id, name, color, client_emails)
- `tasks` — tasks (title, assignee_id, project_id, status, priority, due_at, drive_links[], notes[], sections, sort_order, created_via)
- `task_sections` — structured sections (heading, content)
- `task_updates` — activity feed (author, source, body, status_signal)
- `checkins` — scheduled follow-ups

### Messaging
- `channels` — chat rooms (type: public/private/direct)
- `channel_members` — membership + roles
- `messages` — chat messages (with search_vector TSVECTOR)
- `message_reactions` — emoji reactions
- `files` — file metadata (with search_vector)

### Notifications & Email
- `notifications` — in-app/WhatsApp/email notifications
- `user_preferences` — notification settings, quiet hours
- `email_drafts` — draft lifecycle (draft → approved → sent)

### AI & Agent
- `summaries` — AI-generated channel/project summaries
- `agent_activity` — OpenClaw audit log

---

## 7. Environment Variables

### Required for basic operation
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Required for API routes
```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### AI Task Parsing
```env
TASKBOARD_ANTHROPIC_KEY=sk-ant-...
```

### Gmail (optional)
```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GMAIL_SEND_AS=team@example.com
```

### WhatsApp (optional)
```env
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Webhooks
```env
WEBHOOK_SECRET=your-random-secret
```

### Dev Bypass
```env
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
NEXT_PUBLIC_DEV_BYPASS_USER_ID=9ccc8eb5-...
```

### Branding
```env
NEXT_PUBLIC_TEAM_NAME=My Team
```

---

## 8. State Management Architecture

```
Supabase (PostgreSQL + Realtime)
        ↕ (fetch on init, sync on mutation)
   store.ts / messaging-store.ts
   (in-memory state, observer pattern)
        ↕ (useSyncExternalStore)
   hooks.ts / messaging-hooks.ts
   (React hooks: useTasks, useChannels, etc.)
        ↕
   Components (BoardView, ChannelChat, etc.)
        ↕ (user actions)
   store.updateTask() → optimistic UI → Supabase upsert
   (rollback + error toast on failure)
```

Key pattern: **All mutations are optimistic** — UI updates instantly, Supabase sync happens async. On failure, state rolls back and toast shows error.

---

## 9. Work Completed This Session

### Phase 1: Connected ChatPanel to Claude Sonnet
- Installed `@anthropic-ai/sdk` in `apps/web/package.json`
- Created `/api/chat/parse` route (`src/app/api/chat/parse/route.ts`)
- Rewrote `ChatPanel.tsx` with AI-first parsing + regex fallback
- Added confidence display (High/Medium/Low)

### Phase 2: Critical Bug Fix
- **Store init error visibility** (`store.ts`): Added `storeErrorEmitter.emit()` in `initStore()` catch block so users see a toast when data fails to load

### Phase 3: High-Severity Bug Fix
- **File upload error feedback** (`ChannelChat.tsx`): Added `uploadError` state, red error banner with AlertCircle icon, 5-second auto-dismiss

### Phase 4: Medium-Severity Bug Fixes
- **ProjectManager random color** (`ProjectManager.tsx`): Changed from index-based to `Math.random()` so new projects get varied colors
- **TaskDetailDrawer empty title hint** (`TaskDetailDrawer.tsx`): Red border on empty title textarea

### Phase 5: Low-Severity Bug Fixes
- **LoginPage error handling** (`LoginPage.tsx`): Added error state + loading state + error message display
- **SearchPanel load more** (`SearchPanel.tsx`): Added limit state + "Load more results" button
- **Env documentation** (`.env.example`): Documented `TASKBOARD_ANTHROPIC_KEY`

### Commit
- `5cb13f4` — "Connect ChatPanel to Claude Sonnet + fix 8 QA audit bugs"
- Pushed to GitHub, auto-deployed via Coolify

---

## 10. Known Issues & Production Gaps

### Must Fix
1. **`TASKBOARD_ANTHROPIC_KEY` not in Coolify env vars** — AI task parsing won't work in production until this key is added to Coolify's environment variables for the app
2. **Dev bypass auth is ON** — `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` may be set in production; verify and disable
3. **RLS dev bypass policies** — Schema v3 has permissive RLS for dev; should be removed in production

### Should Verify
4. **Supabase Realtime limits** — Free tier may have connection caps; verify realtime works under load
5. **Gmail service account** — Requires Google Workspace admin consent for domain-wide delegation
6. **Twilio WhatsApp sandbox** — Users must send "join" message to sandbox number first
7. **File storage signed URLs** — 1-hour expiry; long sessions may show broken file links

### Nice to Have
8. **No offline support** — App requires network connection
9. **No pagination on task lists** — All tasks loaded into memory
10. **No rate limiting on client** — Only server-side rate limiting exists

---

## 11. Files Modified in This Session

| File | Change |
|------|--------|
| `apps/web/package.json` | Added `@anthropic-ai/sdk` |
| `apps/web/src/app/api/chat/parse/route.ts` | **NEW** — Claude Sonnet API route |
| `apps/web/src/components/ChatPanel.tsx` | Full rewrite — AI parsing + fallback |
| `apps/web/src/lib/store.ts` | Error toast in initStore catch |
| `apps/web/src/components/ChannelChat.tsx` | Upload error feedback UI |
| `apps/web/src/components/ProjectManager.tsx` | Random color selection |
| `apps/web/src/components/TaskDetailDrawer.tsx` | Empty title red border |
| `apps/web/src/components/LoginPage.tsx` | Error + loading state |
| `apps/web/src/components/SearchPanel.tsx` | Load more pagination |
| `apps/web/.env.example` | Documented Anthropic key |

---

## 12. QA Audit Results

### Bugs Found & Fixed (8)

| # | Bug | Severity | File | Fix |
|---|-----|----------|------|-----|
| 1 | ChatPanel not connected to Sonnet | Critical | ChatPanel.tsx, route.ts | AI parsing + regex fallback |
| 2 | Store initStore fails silently | Critical | store.ts | Added error toast emission |
| 3 | File upload errors swallowed | High | ChannelChat.tsx | Error banner + auto-dismiss |
| 4 | ProjectManager color shifts on delete | Medium | ProjectManager.tsx | Random color instead of index |
| 5 | TaskDetailDrawer no empty-title hint | Medium | TaskDetailDrawer.tsx | Red border on empty |
| 6 | LoginPage no error feedback | Low | LoginPage.tsx | Error state + message |
| 7 | SearchPanel hardcoded 30-result limit | Low | SearchPanel.tsx | Load more button |
| 8 | .env.example missing Anthropic key | Low | .env.example | Added documentation |

### False Positives Investigated & Cleared (6)

| Claimed Bug | Verdict | Why |
|-------------|---------|-----|
| ListView sorting crash | Safe | Uses `?.` and `\|\| ""` fallbacks |
| BoardView drag filter bug | Correct | Draggable items always in filteredTasks |
| ChannelChat null user crash | Handled | Optional chaining throughout |
| CommsHub email matching | Correct | e.id originates from a.id |
| MyDayView timezone issue | Correct | Local timezone is correct for "My Day" |
| Store debounce loses updates | Correct | Optimistic updates are instant |

---

## 13. Deployment Info

### Coolify
- **Dashboard:** `http://localhost:8000`
- **App Resource UUID:** `w44k0ww0wk0okgkwkokso0gk`
- **Base Directory:** `/` (monorepo root)
- **Build:** Nixpacks with `nixpacks.toml`
- **Node:** >=22.12.0

### Current Coolify Env Vars
```
NEXT_PUBLIC_SUPABASE_ANON_KEY=set
NEXT_PUBLIC_SUPABASE_URL=set
PORT=80
HOST=0.0.0.0
```

### Missing from Coolify (needs to be added)
```
TASKBOARD_ANTHROPIC_KEY=sk-ant-...  (for AI task parsing)
SUPABASE_SERVICE_ROLE_KEY=...       (for server-side API routes)
WEBHOOK_SECRET=...                  (for inbound webhooks)
```

---

## 14. How to Run Locally

```bash
# Clone and install
git clone <repo-url>
cd taskboard
npm install

# Set up environment
cp apps/web/.env.example apps/web/.env.local
# Fill in Supabase credentials, Anthropic key, etc.

# Run dev server
npm run dev
# Opens at http://localhost:3000

# Run tests
npm run test

# Build for production
npm run build

# Start production server
npm run start
```

---

## 15. Component Reference (All 23)

| Component | File | Props | Key State |
|-----------|------|-------|-----------|
| BoardView | BoardView.tsx | onSelectTask, onCreateTask | DnD sensors, activeId |
| ListView | ListView.tsx | onSelectTask | sortField, sortDirection |
| MyDayView | MyDayView.tsx | currentUserId, onSelectTask | — |
| TaskCard | TaskCard.tsx | task, onClick, isDragging | — |
| TaskDetailDrawer | TaskDetailDrawer.tsx | task, onClose | titleValue, editing states |
| FilterBar | FilterBar.tsx | — | Uses useFilters() hook |
| ChatPanel | ChatPanel.tsx | currentUserId | messages[], pendingTask, aiParsing |
| ProjectManager | ProjectManager.tsx | onClose | editingId, newName, newColor |
| LoginPage | LoginPage.tsx | — | error, loading |
| SearchPanel | SearchPanel.tsx | onSelectResult, onClose | query, results, limit, activeFilter |
| MessagingView | MessagingView.tsx | currentUserId | activeChannelId |
| ChannelChat | ChannelChat.tsx | channelId, currentUserId | messages, uploadError |
| ChannelList | ChannelList.tsx | onSelectChannel, activeId | — |
| CommsHub | CommsHub.tsx | currentUserId | activeTab |
| EmailDraftComposer | EmailDraftComposer.tsx | draft, onClose | to, subject, body |
| NotificationBell | NotificationBell.tsx | currentUserId | notifications, isOpen |
| NewChannelForm | NewChannelForm.tsx | onClose, onCreate | name, type |
| NewDMPicker | NewDMPicker.tsx | onSelect, currentUserId | — |
| FileUploadZone | FileUploadZone.tsx | onUpload | isDragging |
| FileList | FileList.tsx | files | — |
| ProjectFileBrowser | ProjectFileBrowser.tsx | projectId | files |
| ErrorBoundary | ErrorBoundary.tsx | children | hasError |
| Toast | Toast.tsx | — | Subscribes to storeErrorEmitter |
