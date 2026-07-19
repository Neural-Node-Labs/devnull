# devnull-ui

The web dashboard for [devnull](../README.md), a ReAct CLI agent. Built with React 19, TypeScript, and Vite.

## What's here

- **Chat** — send tasks to the agent, review generated plans, approve/reject them, upload files to the active project's workspace
- **Projects** — add/select/remove projects and browse their workspace files
- **Telemetry** — search agent logs (reason/action/observation traces, tool calls, token usage)
- **Diagnostics** — live health checks against the API, loaded skills, and protocol status
- **Settings** — theme picker, password change, LLM API key, and (for admins) user management
- **Admin** — user management, visible only to the first-login-created admin account

Auth is JWT-based; the token is stored in `localStorage` and attached as a `Bearer` header on every request (see `src/api/client.ts`).

## Running locally

```bash
npm install
npm run dev
```

This starts Vite on `http://localhost:5173` and proxies `/api` to `http://localhost:3001` (see `vite.config.ts`) — point that at a running devnull API server.

## Building

```bash
npm run build   # type-checks with tsc -b, then bundles with vite build
npm run preview # serve the production build locally
```

## Docker

```bash
docker build -t devnull-ui .
docker run -p 8080:80 devnull-ui
```

The image is a two-stage build: Node compiles the static bundle, then nginx serves it and proxies `/api/` to an `api` service (see `nginx.conf` — update the `proxy_pass` target if your API container has a different name).

## Themes

Nine built-in themes live in `src/themes.ts` as plain color-token objects, applied via CSS custom properties (`src/context/ThemeContext.tsx`). Every page uses `var(--color-*)` tokens rather than hardcoded colors — new pages should follow the same pattern rather than introducing a separate styling approach (see review notes for what happens when that slips: the Projects and Diagnostics pages once used Tailwind utility classes despite Tailwind never being installed in this project).
