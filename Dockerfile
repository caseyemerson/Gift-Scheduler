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
RUN apk add --no-cache python3 make g++

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Remove build tools after install to keep image small, but keep libstdc++
# which is needed at runtime by better-sqlite3's native module
RUN apk del python3 make g++ && apk add --no-cache libstdc++

# Copy server source
COPY server/src/ ./server/src/

# Copy built frontend from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Create directory for SQLite database with persistent volume
RUN mkdir -p /data

# Create non-root user for running the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/gift_scheduler.db

EXPOSE 3001

# Switch to non-root user
USER appuser

# Health check — use PORT env var since Railway may override the default
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

CMD ["node", "server/src/index.js"]
