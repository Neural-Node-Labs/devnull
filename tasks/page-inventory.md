# Page Inventory

## Overview
This document inventories every page/route in the devnull UI application, listing URL patterns, key interactive elements, and expected states (loading, empty, error, populated).

## Route Map

| # | Page | URL Pattern | Auth Required | Admin Only | Description |
|---|------|-------------|---------------|------------|-------------|
| 1 | Login | `/login` | No | No | Authentication page — login or first-user registration |
| 2 | Home | `/` | Yes | No | Dashboard with health info and navigation cards |
| 3 | Chat | `/chat` | Yes | No | ReAct agent chat interface with plan/execute flow |
| 4 | Projects | `/projects` | Yes | No | Project CRUD and workspace file browser |
| 5 | Telemetry | `/telemetry` | Yes | No | Agent logs viewer with search/filter |
| 6 | Diagnostics | `/diagnostics` | Yes | No | System health checks and loaded skills display |
| 7 | Settings | `/settings` | Yes | No | Theme, user management (admin), LLM key, password |
| 8 | Admin | `/admin` | Yes | Yes | User management table (admin only) |
| 9 | Plans | `/plans` | Yes | No | List of saved plans with status badges |
| 10 | Plan Detail | `/plans/:id` | Yes | No | Single plan view with task management |
| 11 | Task History | `/task-history` | Yes | No | Historical task execution records |
| 12 | Phase Reports | `/phase-reports` | Yes | No | Phase planning reports viewer |
| 13 | 404 / Not Found | `/*` | Yes | No | Catch-all for unmatched routes |

---

## 1. Login Page (`/login`)

### Key Interactive Elements
- `#username` — text input for username
- `#password` — password input
- `button[type="submit"]` — "Sign In" or "Register & Sign In" submit button
- Auto-detects if users exist: shows registration form if `GET /api/v1/users/count` returns 0

### States
- **Loading**: Shows "Loading..." centered while checking user count
- **Populated (Login mode)**: Shows username/password fields + "Sign In" button
- **Populated (Register mode)**: Shows username/password fields + "Register & Sign In" button + "min 4 chars" hint
- **Error**: Red error banner above submit button (invalid credentials, validation errors)
- **Already authenticated**: Redirects to `/` immediately

### API Calls
- `GET /api/v1/users/count` — check if users exist (on mount)
- `POST /api/v1/login` — authenticate
- `POST /api/v1/register` — register first user

---

## 2. Home Page (`/`)

### Key Interactive Elements
- Navigation cards (links to `/chat`, `/projects`, `/telemetry`, `/diagnostics`, `/settings`, `/admin`)
- Health info badges: API Version, Uptime, Status
- Logo modal trigger (click logo button)

### States
- **Loading**: No explicit loading state — health data loads async
- **Populated**: Shows welcome header with username, health badges, navigation cards
- **Error**: Health API failure silently ignored (cards still render)
- **Empty**: N/A — always shows cards

### API Calls
- `GET /api/v1/health` — fetch health info (on mount)

---

## 3. Chat Page (`/chat`)

### Key Interactive Elements
- `textarea[aria-label="Message input"]` — message input
- `button` "Send" — send message
- `button` "+ New chat" — clear conversation
- `select[aria-label="Plan mode"]` — plan mode selector (Always/Auto/Never)
- `button` "Voice" — speech recognition toggle
- `button` "Upload" — file upload to active project
- `input[type="file"]` — hidden file input
- `button` "Options ▼" — toggle advanced options
- Advanced checkboxes: Full context mode, Phase planning, Isolated workspace
- Max iterations number input
- `button` "Cancel" — abort in-flight request
- `button` "Approve" / "Reject" — plan approval buttons
- `button` "▶ Continue" — continue past iteration limit
- `div[role="log"]` — chat message container

### States
- **Loading**: Shows "Thinking..." with spinner + Cancel button
- **Empty**: Shows "Send a message to start chatting with devnull"
- **Populated**: Shows message history (user, assistant, system, limitation messages)
- **Error**: Red error section below messages
- **Plan pending**: Shows plan preview with Approve/Reject buttons
- **Limitation**: Shows limitation message with "▶ Continue" button
- **Uploading**: Shows "Uploading…" on upload button
- **Voice active**: Shows "Listening..." on voice button

### API Calls
- `POST /api/v1/chat` — send message
- `POST /api/v1/chat/plan` — generate plan (via plan mode)
- `POST /api/v1/chat/execute` — execute approved plan
- `POST /api/v1/plans` — auto-save plan to DB
- `GET /api/v1/projects` — list projects (for file upload)
- `POST /api/v1/projects/:id/upload` — upload file

---

## 4. Projects Page (`/projects`)

### Key Interactive Elements
- `button` "＋ New project" — toggle add form
- `input#proj-name` — project name input in add/edit form
- `button` "Create project" / "Save changes" — submit form
- `button` "Cancel" — close form
- Project list items (clickable to select)
- Radio-style circle buttons for activating a project
- `input[type="checkbox"]` — "Include in LLM context" toggle
- `button` "⬇ Download" — download workspace zip
- `button` "Rename" — edit project name
- `button` "Delete" — remove project
- `button` "copy" — copy project path to clipboard
- Workspace file browser with breadcrumb navigation
- `button` "Delete" (per file) — delete workspace file

### States
- **Loading**: Shows "Loading projects…" centered
- **Empty (no projects)**: Shows "No projects yet" with CTA to create one
- **Populated**: Shows project list with active indicator, file browser for selected project
- **Error (load)**: Red error banner with Retry button
- **Error (form)**: Inline error message in form
- **Form open**: Shows add/edit form with name input and slug preview
- **File browser loading**: Shows "Loading files…"
- **File browser empty**: Shows "This folder is empty."
- **File browser error**: Shows error message
- **Downloading**: Shows "Zipping…" on download button

### API Calls
- `GET /api/v1/projects` — list projects
- `POST /api/v1/projects` — create project
- `PUT /api/v1/projects/:id` — update project
- `DELETE /api/v1/projects/:id` — delete project
- `POST /api/v1/projects/:id/activate` — set active project
- `GET /api/v1/projects/:id/files` — list workspace files
- `DELETE /api/v1/projects/:id/files` — delete workspace file
- `GET /api/v1/projects/:id/download` — download workspace zip

---

## 5. Telemetry Page (`/telemetry`)

### Key Interactive Elements
- Log file tabs: "thinking", "llm", "sys" buttons
- `button` "Refresh" — reload telemetry
- `input[aria-label="Search telemetry"]` — search input
- `input[aria-label="Filter by task ID"]` — task ID filter
- Telemetry entry list (clickable to expand/collapse)
- ReAct trace legend badges (Reason, Action, Observation, Command, Token Usage)

### States
- **Loading**: Shows "Loading telemetry data..."
- **Empty**: Shows "No telemetry entries found for \"{log}\""
- **Empty (search)**: Shows "No entries matching \"{query}\" in \"{log}\""
- **Populated**: Shows collapsible entry list with type labels and timestamps
- **Error**: Red error banner
- **Expanded entry**: Shows JSON pretty-print with JsonViewer

### API Calls
- `GET /api/v1/telemetry?log={log}&limit=100` — fetch telemetry entries

---

## 6. Diagnostics Page (`/diagnostics`)

### Key Interactive Elements
- `button` "Run tests" — re-run health checks
- Test result cards (5 tests: API Connection, Health Check, Skills Loaded, Telemetry Available, React Render)
- Skills list with role badges and trigger tags
- Directives & protocol section

### States
- **Loading**: Tests auto-run on mount; "Running…" on button
- **Populated**: Shows test results with pass/fail/pending status, skills list, directives
- **Empty (skills)**: Shows "No skills loaded"
- **Error**: Per-test failure messages in result cards

### API Calls
- `GET /api/v1/health` — health check
- `GET /api/v1/skills` — list skills
- `GET /api/v1/telemetry?log=thinking&limit=5` — telemetry check

---

## 7. Settings Page (`/settings`)

### Key Interactive Elements
- Theme selector grid — clickable theme cards with color preview dots
- User management section (admin only): user table, Add User form, Edit/Delete buttons
- `input[aria-label="Username"]` — username input in add/edit forms
- `select[data-testid="role-selector"]` — role selector
- Password change section (disabled)
- LLM Key Management: API key input, "Save Key" button, "Clear" button

### States
- **Populated**: Shows theme grid, user management (if admin), password section (disabled), LLM key section
- **Loading (LLM key)**: Shows "Checking current key status…"
- **Error**: Toast message for failed operations
- **Success**: Toast message for successful operations
- **Add user form open**: Shows username/password/role form
- **Edit user mode**: Inline editing in user table row

### API Calls
- `GET /api/v1/settings/llm-key` — check LLM key status
- `PUT /api/v1/settings/llm-key` — set LLM key
- `DELETE /api/v1/settings/llm-key` — clear LLM key
- `GET /api/v1/users` — list users (admin)
- `POST /api/v1/users` — create user (admin)
- `PUT /api/v1/users/:id` — update user (admin)
- `DELETE /api/v1/users/:id` — delete user (admin)

---

## 8. Admin Page (`/admin`)

### Key Interactive Elements
- `button` "Add User" / "Cancel" — toggle add user form
- `input[aria-label="Username"]` — username input
- Password input
- `select[data-testid="role-selector"]` — role selector
- `div[data-testid="user-list"]` — user table
- User table: ID, Username, Role, Created, Actions (Edit, Delete)
- Inline edit mode: Save/Cancel buttons per row

### States
- **Populated**: Shows user management table with all users
- **Empty (no users)**: Shows empty table (unlikely since admin exists)
- **Add user form open**: Shows username/password/role form
- **Edit mode**: Inline editing in table row
- **Error**: Toast message for failed operations
- **Success**: Toast message for successful operations

### API Calls
- `GET /api/v1/users` — list users
- `POST /api/v1/users` — create user
- `PUT /api/v1/users/:id` — update user
- `DELETE /api/v1/users/:id` — delete user

---

## 9. Plans Page (`/plans`)

### Key Interactive Elements
- `button` "Refresh" — reload plans list
- Plan list items (clickable to navigate to detail)
- Status badges: active (primary), completed (success), cancelled (error)
- `button` "▶ Continue / Validate" — navigate to chat with task pre-filled
- `button` "View Details" — navigate to plan detail

### States
- **Loading**: Shows "Loading plans..."
- **Empty**: Shows "No plans yet. Plans are created when devnull generates a plan for a task."
- **Populated**: Shows list of plan cards with status badges and action buttons
- **Error**: Red error banner

### API Calls
- `GET /api/v1/plans` — list plans

---

## 10. Plan Detail Page (`/plans/:id`)

### Key Interactive Elements
- `button` "← Back" / "← Back to Plans" — navigate back
- `button` "Mark Completed" — set plan status to completed
- `button` "Cancel Plan" — set plan status to cancelled
- Plan content in `<pre>` block
- Task list with status selectors (pending/in_progress/completed/failed/skipped)
- `button` "✕" — delete individual task
- `input` "Add a new task..." — add task input
- `button` "Add" — submit new task

### States
- **Loading**: Shows "Loading plan..."
- **Error / Not found**: Shows error message with "← Back to Plans" button
- **Populated**: Shows plan info, content, task list
- **Empty (tasks)**: Shows "No tasks in this plan yet."
- **Adding task**: Shows "..." on Add button

### API Calls
- `GET /api/v1/plans/:id` — get plan with tasks
- `PUT /api/v1/plans/:id/status` — update plan status
- `PUT /api/v1/plans/:id/tasks/:taskId` — update task status
- `POST /api/v1/plans/:id/tasks` — add task
- `DELETE /api/v1/plans/:id/tasks/:taskId` — delete task

---

## 11. Task History Page (`/task-history`)

### Key Interactive Elements
- `button` "↻ Refresh" — reload task history
- Task list items (clickable to expand/collapse)
- Stat badges: Tokens (color-coded), Iterations (color-coded)
- Expanded view: shows task summary

### States
- **Loading**: Shows spinner + "Loading task history..."
- **Empty**: Shows "No task history yet. Run a task in the Chat page to see it here."
- **Populated**: Shows list of task entries with stat badges
- **Error**: Red error banner
- **Expanded**: Shows task summary text

### API Calls
- `GET /api/v1/task-history?limit=50` — fetch task history

---

## 12. Phase Reports Page (`/phase-reports`)

### Key Interactive Elements
- `button` "↻ Refresh" — reload reports
- `input` "Filter by task ID..." — task ID search input
- `button` "Search" — trigger search
- Report list items (clickable to expand/collapse)
- Stat badges: Tokens (color-coded), Iterations (color-coded)

### States
- **Loading**: Shows spinner + "Loading phase reports..."
- **Empty**: Shows "No phase reports found. Run a task with phase planning enabled to see reports here."
- **Populated**: Shows grouped reports by task ID with phase details
- **Error**: Red error banner
- **Expanded**: Shows phase report content

### API Calls
- `GET /api/v1/phase-reports?taskId={taskId}` — fetch phase reports

---

## 13. Not Found Page (`/*`)

### Key Interactive Elements
- `Link` "Back to dashboard" — navigate to `/`

### States
- **Populated**: Shows compass icon, "Page not found" heading, description, and back link

### API Calls
- None

---

## Shared Components

### Navbar
- Logo button (opens info modal)
- Navigation links: Home, Chat, Projects, Telemetry, Plans, Diagnostics, Settings, Admin (admin only)
- User badge with username and ADMIN tag
- Logout button
- Mobile hamburger menu with dropdown panel
- Info modal with zoomed logo and project metadata

### ProtectedRoute
- Loading state: "Loading..." centered
- Unauthenticated: Redirect to `/login`
- Non-admin on admin route: Redirect to `/`
- Authenticated: Render children

### Layout
- Renders Navbar + `<Outlet />` for nested routes
- Max-width 1200px centered content
