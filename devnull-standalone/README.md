# devnull — Standalone Desktop Package

A self-contained, Docker-free deployment of the devnull ReAct CLI agent with HTTP API server.

## What's Included

```
devnull-standalone/
├── dist/                          # Compiled JavaScript
├── node_modules/                  # Production dependencies
├── agent/
│   ├── devnull.md                 # Engineering protocol
│   ├── config/llm.yaml            # LLM configuration
│   └── skills/                    # 13 hot-plug skills
├── migrations/
│   └── sqlite/                    # SQLite migration files
├── scripts/
│   └── devnull-server.sh          # Server launcher script
├── package.json                   # Package manifest
├── .env.example                   # Environment template
└── README.md                      # This file
```

## Prerequisites

- **Node.js 18+** (Node.js 20 LTS recommended)
- **npm** (ships with Node.js)
- **Operating System**: Linux, macOS, or Windows (via Git Bash / WSL)

No Docker required. No PostgreSQL required. The SQLite database is auto-created on first run.

## Quick Start

### 1. Extract the package

```bash
# If you received a tarball:
tar -xzf devnull-standalone.tar.gz
cd devnull-standalone
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your **DeepSeek API key** (required for LLM features):

```env
DEEPSEEK_API_KEY=sk-your-key-here
```

### 3. Start the server

```bash
# Using the launcher script:
./scripts/devnull-server.sh

# Or with a custom port:
DEVNULL_API_PORT=8080 ./scripts/devnull-server.sh
```

### 4. Verify it's running

```bash
# Health check:
curl http://localhost:8080/api/v1/health

# Expected response:
# {"success":true,"data":{"status":"ok","version":"0.2.0","uptime":...}}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek API key for LLM access |
| `ANTHROPIC_API_KEY` | (optional) | Anthropic API key (fallback provider) |
| `GITHUB_TOKEN` | (optional) | GitHub PAT for HTTPS auth |
| `DEVNULL_API_KEY` | (optional) | API auth key (Bearer token) |
| `DEVNULL_API_PORT` | `3001` | API server port |
| `DEVNULL_API_HOST` | `0.0.0.0` | API server bind address |
| `DEVNULL_HOME` | (package dir) | Runtime home directory |
| `NODE_ENV` | `production` | Runtime environment |
| `DATABASE_TYPE` | `sqlite` | Database backend (`sqlite` or `postgres`) |
| `DATABASE_SQLITE_PATH` | `~/.devnull/data/devnull.db` | Custom SQLite file path |
| `MAX_ITERATIONS` | `20` | ReAct loop iteration ceiling |

### Database

By default, devnull uses **SQLite** — a file-based database that requires zero configuration:

- **Location**: `~/.devnull/data/devnull.db`
- **Auto-created**: Yes, on first server start
- **Custom path**: Set `DATABASE_SQLITE_PATH` in `.env`

No separate database process to install, configure, or maintain.

## Usage

### API Endpoints

Once the server is running, the following endpoints are available:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/login` | User login (returns auth token) |
| `POST` | `/api/v1/logout` | User logout |
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/chat` | Send a chat message |
| `POST` | `/api/v1/chat/plan` | Generate a plan |
| `POST` | `/api/v1/chat/execute` | Execute a task |
| `GET` | `/api/v1/telemetry` | View telemetry logs |
| `GET` | `/api/v1/skills` | List loaded skills |
| `GET` | `/api/v1/users` | List users |
| `POST` | `/api/v1/users` | Create a user |
| `GET` | `/api/v1/plans` | List plans |
| `POST` | `/api/v1/plans` | Create a plan |

### CLI Mode

You can also use devnull directly from the command line:

```bash
# List all loaded skills
node dist/cli/index.js --skills

# Index the current workspace
node dist/cli/index.js --index

# Execute a task
node dist/cli/index.js --task "your task description"

# Interactive chat mode
node dist/cli/index.js --chat
```

## Stopping the Server

Press **Ctrl+C** in the terminal where the server is running. The launcher script handles
graceful shutdown — it sends SIGTERM to the Node.js process and waits for it to exit.

## Logs

Server logs are written to the `.log/` directory in the package root:

- `thinking.log` — ReAct loop reasoning traces
- `llm.log` — LLM API call logs
- `sys.log` — System-level events and errors

## Troubleshooting

### "Node.js not found"
Install Node.js 20 LTS from [nodejs.org](https://nodejs.org/).

### "dist/cli/index.js not found"
The package may be incomplete. Re-extract the tarball or run `npm run build` from the project root.

### "node_modules not found"
Run `npm install --omit=dev` in the package directory.

### "Port 3001 already in use"
Either stop the process using port 3001, or set a different port:
```bash
DEVNULL_API_PORT=8080 ./scripts/devnull-server.sh
```

### "DEEPSEEK_API_KEY not configured"
Copy `.env.example` to `.env` and add your DeepSeek API key. The server will start without it,
but LLM features won't work.

### SQLite errors
The database file is created at `~/.devnull/data/devnull.db`. If you encounter permission errors,
ensure the directory is writable:
```bash
mkdir -p ~/.devnull/data
```

## Building from Source

If you want to build the standalone package from the source repository:

```bash
# From the devnull project root:
bash scripts/package-standalone.sh

# Output: devnull-standalone/ directory + devnull-standalone.tar.gz
```

## License

LicenseRef-Proprietary
