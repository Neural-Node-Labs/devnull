# syntax=docker/dockerfile:1

# =============================================================================
# Build args
# =============================================================================
ARG NODE_IMAGE=node:20-alpine
ARG NGINX_IMAGE=nginx:alpine
ARG VERSION=0.2.0
ARG BUILD_DATE

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder

LABEL \
    org.opencontainers.image.title="devnull-ui (builder)" \
    org.opencontainers.image.description="devnull UI — build stage" \
    org.opencontainers.image.source="https://github.com/neural-node-labs/devnull" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.authors="Sir John M. Nueva" \
    org.opencontainers.image.licenses="LicenseRef-Proprietary"

WORKDIR /build

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ─── Stage 2: Serve with nginx ──────────────────────────────────────────────
FROM ${NGINX_IMAGE}

LABEL \
    org.opencontainers.image.title="devnull-ui" \
    org.opencontainers.image.description="devnull UI — nginx serving React SPA" \
    org.opencontainers.image.source="https://github.com/neural-node-labs/devnull" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.authors="Sir John M. Nueva" \
    org.opencontainers.image.licenses="LicenseRef-Proprietary"
    org.opencontainers.image.base.name="${NGINX_IMAGE}"

# Copy built assets from builder
COPY --from=builder /build/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Non-root user (nginx already runs as nginx user)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

