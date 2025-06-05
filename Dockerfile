# Simple Remix app Dockerfile
FROM node:20-alpine

# Install basic dependencies
RUN apk add --no-cache curl tini

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S remix -u 1001

# Copy package files
COPY package*.json ./

# Install ALL dependencies (needed for build)
RUN npm ci && npm cache clean --force

# Copy application code
COPY --chown=remix:nodejs . .

# Build the Remix app
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production && npm cache clean --force

# Switch to non-root user
USER remix

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["npm", "start"]