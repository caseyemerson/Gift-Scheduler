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

# Remove build tools after install to keep image small
RUN apk del python3 make g++

# Copy server source
COPY server/src/ ./server/src/

# Copy built frontend from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Create directory for SQLite database with persistent volume
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/gift_scheduler.db

EXPOSE 8080

# Health check — use the PORT env var so it works regardless of platform config
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server/src/index.js"]
