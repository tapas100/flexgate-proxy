# Containerfile for FlexGate Proxy
# Build with: podman build -t localhost/flexgate-proxy:latest .
# Or use: make build

# Stage 1: Build
FROM docker.io/node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM docker.io/node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 flexgate && \
    adduser -D -u 1001 -G flexgate flexgate

WORKDIR /app

# Copy package files and install ONLY production dependencies
COPY --from=builder --chown=flexgate:flexgate /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=flexgate:flexgate /app/dist ./dist
COPY --from=builder --chown=flexgate:flexgate /app/config ./config
COPY --from=builder --chown=flexgate:flexgate /app/migrations ./migrations

# Create logs directory
RUN mkdir -p /app/logs && chown -R flexgate:flexgate /app/logs

# Switch to non-root user
USER flexgate

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/bin/www"]
