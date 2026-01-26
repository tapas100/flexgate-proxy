FROM node:20-alpine

# Add metadata
LABEL maintainer="tapas100"
LABEL description="Production-grade proxy server"

# Set working directory
WORKDIR /app

# Install dependencies (separate layer for caching)
COPY package*.json ./
RUN npm ci --production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "bin/www"]
