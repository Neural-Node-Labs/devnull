# Task: Fix and Refactor UI - Auth, Logout, Themes

## Plan

### 1. Create a complete SPA UI (`public/index.html`)
- Single HTML file with embedded CSS + JS (no build step)
- React-like SPA using vanilla JS with hash-based routing
- All pages: Login, Chat, Projects, Settings, Telemetry, Admin, Diagnostic

### 2. Auth System
- Login page with username/password form
- Token storage in localStorage
- Auth headers on all API calls
- Route guards (redirect to login if not authenticated)
- Logout button in navigation
- Admin-only route protection

### 3. 10 Themes in Settings
- Theme selector with 10 distinct themes
- Themes stored in localStorage
- Applied via CSS custom properties
- Themes: Default Dark, Midnight Blue, Forest Green, Ocean Blue, Sunset Orange, Lavender Purple, Slate Gray, Coffee Brown, Cyberpunk Neon, Light Mode

### 4. Serve UI from Express
- Add `express.static` for `public/` directory
- Serve `index.html` for all routes (SPA fallback)

### 5. Update Tests
- Update UI tests to work with the new SPA structure

## Implementation Steps
- [x] Plan written
- [ ] Create `public/index.html` with full SPA
- [ ] Update `src/api/server.ts` to serve static files
- [ ] Verify with goal validator
