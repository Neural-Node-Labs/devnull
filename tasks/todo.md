# Plan: fix this the chat page data lost after movinig to other page going back chat is empty 2. In Plan page add a botton to continue/validate the plan.

## Plan: Fix Chat Data Loss & Add Plan Validation Button

- [ ] **RCA: Investigate chat data persistence** — Trace the chat state management in the UI. Check if chat messages are stored in React state only (lost on navigation) vs. localStorage/sessionStorage. Identify the exact mechanism causing data loss on page navigation and back.

- [ ] **Implement chat persistence** — Store chat messages in `sessionStorage` (survives SPA navigation but clears on tab close) or `localStorage` (persists across sessions). Update the chat component to save/restore messages on mount/unmount. Ensure the restore doesn't break the streaming/append flow.

- [ ] **Add "Continue/Validate Plan" button to Plan page** — Locate the Plan page component. Add a button that re-sends the current plan to the API for validation/continuation. Wire it to the existing `/api/v1/chat/plan` or `/api/v1/chat/execute` endpoint with the plan context.

- [ ] **Verify both fixes** — Navigate away from chat and back; confirm messages are restored. Click the new Plan button; confirm it triggers the expected API call and displays the result.

## Review
Good. Now let me write a summary of what was done.

---

## ✅ Summary of Changes

### Issue 1: Chat data lost after navigating away and back

**Root cause:** The `ChatPage` component uses React `useState` for all its state (messages, input, plan, sessionId, etc.). When the user navigates to another page and comes back, React unmounts and remounts the component, losing all state.

**Fix:** Persist the chat state in `sessionStorage` so it survives navigation within the same browser tab.

**Files changed: `ui/src/pages/ChatPage.tsx`**

1. **Added `CHAT_STORAGE_KEY`, `PersistedChatState` interface, and helper functions** (`saveChatState`, `loadChatState`, `clearChatState`) — serialize/deserialize the chat state to/from `sessionStorage`.

2. **Initialized all state from saved state** — on mount, `loadChatState()` is called and its values are used as initial state defaults.

3. **Added a persistence `useEffect`** — watches all state variables and writes them to `sessionStorage` on every change.

4. **`handleNewChat` now calls `clearChatState()`** — so starting a new chat properly clears the persisted state.

5. **Added `useSearchParams` import** — to support the second feature (reading `?task=` from URL).

### Issue 2: Plan page needs a "Continue/Validate" button

**Files changed: `ui/src/pages/PlansPage.tsx`**

1. **Added "▶ Continue / Validate" button** on each active plan card — navigates to `/chat?task=<encoded task description>`.

2. **Added "View Details" button** alongside it — navigates to the plan detail page (replaces the old click-to-navigate behavior on the whole card).

**Files changed: `ui/src/pages/ChatPage.tsx`**

3. **Reads `?task=` query parameter** on mount — if present, uses it as the initial input value.

4. **Auto-sends the task** — when a task is passed via URL and there are no existing messages, the chat automatically sends it after a 100ms render delay (so the user sees the message being sent immediately).

### Verification
- ✅ UI TypeScript compiles cleanly (`npx tsc --noEmit`)
- ✅ Vite production build succeeds (`npx vite build`)
- ✅ Server TypeScript compiles cleanly (`npx tsc --noEmit`)
