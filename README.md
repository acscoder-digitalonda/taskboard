# TaskBoard

Drag-and-drop task management app with chat-based task creation, structured task briefs, and team views.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS v4, Lucide icons
- **Drag & Drop:** @dnd-kit/core + @dnd-kit/sortable
- **Database:** Supabase (currently in-memory — see "Wiring Supabase" below)
- **Auth:** Google Login (not yet wired — see "Google Auth" below)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase credentials in .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main app (board, list, my day views)
│   ├── layout.tsx        # Root layout with fonts
│   └── globals.css       # Tailwind v4 theme tokens (CMYK colors)
├── components/
│   ├── BoardView.tsx     # Kanban board with drag-and-drop
│   ├── ListView.tsx      # Sortable table (desktop) / card list (mobile)
│   ├── MyDayView.tsx     # Personal daily view (top 3 + upcoming)
│   ├── TaskCard.tsx      # Reusable task card with badges
│   ├── TaskDetailDrawer.tsx  # Full task detail panel with structured sections
│   ├── ChatPanel.tsx     # Natural language task creation
│   ├── FilterBar.tsx     # Assignee / project / status filters
│   └── ProjectManager.tsx    # Project CRUD modal
├── lib/
│   ├── store.ts          # In-memory store with pub/sub (swap to Supabase)
│   ├── hooks.ts          # useTasks, useProjects, useMyDayTasks, useFilters
│   ├── data.ts           # Seed data (users, projects, sample tasks)
│   └── utils.ts          # Helpers (getUserById, formatDue, etc.)
├── types/
│   └── index.ts          # TypeScript interfaces (Task, TaskSection, etc.)
└── supabase/
    └── schema.sql        # Database schema — run in Supabase SQL editor
```

## Key Features

- **3 Views:** Board (Kanban), List (sortable table), My Day (personal)
- **Structured Task Briefs:** Each task has named sections (Goal, Scope, Deliverables, Done When, etc.)
- **Chat-Based Creation:** Natural language parsing ("Draft proposal for ACME, assign to Katie, due tomorrow")
- **Drag & Drop:** Move tasks between status columns
- **Project Management:** Color-coded projects with task counts
- **Responsive:** Mobile-first, touch-friendly, stacked layout on phones

## TODO: Developer Tasks

### 1. Wire Supabase Database
The app currently uses an in-memory store (`src/lib/store.ts`). To persist data:
- Create a Supabase project
- Run `supabase/schema.sql` in the SQL editor
- Replace the in-memory store methods with Supabase client calls
- The `@supabase/supabase-js` package is already installed
- Enable Realtime on the `tasks` table for live updates across tabs

### 2. Google Login
- Set up Google OAuth in Supabase Auth dashboard
- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local`
- Replace the hardcoded user selector in `page.tsx` with actual auth
- Map authenticated Google users to the `users` table

### 3. WhatsApp Integration
- Set up WhatsApp Business API (via Meta or a provider like Twilio)
- Create an API route (`/api/whatsapp/webhook`) to receive messages
- Parse incoming WhatsApp messages using the same `parseTaskInput()` from `store.ts`
- Create tasks with `created_via: "whatsapp"`
- Send confirmation messages back via WhatsApp API

### 4. Future Features
- Check-in system (scheduled follow-ups at 3h, 12h, 24h intervals)
- Slack notifications
- File upload to Supabase Storage
- Team activity feed

## Deployment

### Vercel (Recommended for Next.js)
```bash
npm i -g vercel
vercel
```

### Self-hosted (Node.js server)
```bash
npm run build
npm start
# Runs on port 3000 by default
```

### Docker (optional)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
EXPOSE 3000
```

## Design Tokens

The app uses a CMYK-inspired color scheme defined in `globals.css`:
- **Cyan:** #00BCD4
- **Magenta:** #E91E63
- **Yellow:** #FFD600
- **Key (Purple):** #9C27B0
- **Accent (Orange):** #FF5722

Font: Roboto (300–900 weights)
