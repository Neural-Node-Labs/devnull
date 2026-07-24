# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build toolchain for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json ./
RUN npm install --omit=optional

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc -p tsconfig.json

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built artifacts and production dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory for SQLite and logs with correct permissions
RUN mkdir -p /data/.log && chown -R appuser:appgroup /data

# Create workspace root for projects (PROJECTS_ROOT defaults to /app/workspace)
RUN mkdir -p /app/workspace && chown appuser:appgroup /app/workspace

# Switch to non-root user
USER appuser

# Default environment
ENV NODE_ENV=production
ENV DEVNULL_API_PORT=3001
ENV DEVNULL_API_HOST=0.0.0.0
ENV DATABASE_TYPE=sqlite
ENV DATABASE_SQLITE_PATH=/data/devnull.db
ENV DEVNULL_LOG_DIR=/data/.log

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1

# Start the API server
CMD ["node", "dist/api/index.js"]
