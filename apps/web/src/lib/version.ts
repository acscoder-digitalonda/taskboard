/**
 * App version tracking.
 *
 * Bump APP_VERSION and add a changelog entry every time a user-facing
 * feature ships. This powers the version badge in the user menu and
 * the "What's New" section so users can see recent updates.
 */

export const APP_VERSION = "1.7.0";
export const APP_BUILD_DATE = "2026-02-23";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.7.0",
    date: "2026-02-23",
    title: "Mobile app & notifications",
    items: [
      "PWA manifest \u2014 install TaskBoard on iPhone or Android",
      "Notification preferences \u2014 WhatsApp number, toggles, quiet hours",
      "WhatsApp notifications via Twilio",
      "Bug fix: WhatsApp delivery auth header",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-02-23",
    title: "External API",
    items: [
      "API key auth (X-API-Key header) for machine-to-machine access",
      "GET /api/v1/members — list team members with profile info",
      "GET /api/v1/tasks — task reports with status/date/assignee filters",
      "POST /api/v1/tasks/assign — LLM-powered task creation from natural language",
      "Shared task parser extracted for reuse across chat + API",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-02-23",
    title: "Security & user profiles",
    items: [
      "Email domain whitelist — only @digitalonda.com accounts can sign in",
      "Edit Profile in user menu — update name, role, and bio",
      "Role selector (Design, Strategy, Development, PM, Member)",
      "Profile data persists across logins (no longer overwritten by Google)",
      "Deployed to Vercel with auto-deploy on push to main",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-02-23",
    title: "Account switching & AI status",
    items: [
      "User menu dropdown — click your avatar to sign out / switch accounts",
      "Google account picker now shown on every sign-in",
      "ChatPanel shows AI or Basic badge for parsing mode",
      "Clear cache button on login page for stuck sessions",
      "Version tracking & What's New panel",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-02-23",
    title: "Onboarding tour",
    items: [
      "7-slide onboarding modal for new users (auto-shows first 3 logins)",
      "Help button in nav to re-open the tour anytime",
      "Custom SVG illustrations for each feature",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-02-22",
    title: "Email triage system",
    items: [
      "AI-powered email classification & auto-reply drafts",
      "Project context system for AI memory",
      "Agent endpoints for ONDA-Robot task management",
      "Triage badges on email drafts and task details",
      "Inbound email webhook with attachment handling",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-02-22",
    title: "Mobile polish",
    items: [
      "Fixed header layout on small screens",
      "Board view horizontal scroll on mobile",
      "Notification bell sizing fix",
      "Email composer footer pinned to bottom",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-02-21",
    title: "Initial release",
    items: [
      "Kanban board with drag & drop",
      "List view with sorting",
      "My Day personal dashboard",
      "AI-powered task creation via chat",
      "Messaging with project channels",
      "Email draft composer with Gmail integration",
      "Real-time updates via Supabase",
      "Google OAuth sign-in",
    ],
  },
];
