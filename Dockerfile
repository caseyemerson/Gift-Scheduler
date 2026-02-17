# Stage 1: Build the React frontend
FROM node:18-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN ./node_modules/.bin/vite build

# Stage 2: Production server
FROM node:18-alpine AS production
WORKDIR /app

# Install build tools needed for better-sqlite3 native compilation
# su-exec is needed for the entrypoint to drop from root to appuser
RUN apk add --no-cache python3 make g++ su-exec

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Remove build tools after install to keep image small
RUN apk del python3 make g++

# Copy server source
COPY server/src/ ./server/src/

# Copy built frontend from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Create directory for SQLite database with persistent volume
RUN mkdir -p /data

# Create non-root user for running the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app /data

# Copy entrypoint script that fixes volume permissions then drops to appuser
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/gift_scheduler.db

EXPOSE 8080

# Health check — use the PORT env var so it works regardless of platform config
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Entrypoint runs as root to fix volume permissions, then drops to appuser
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server/src/index.js"]
