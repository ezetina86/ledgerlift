# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# ── Stage 2: Build Go backend ─────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/*.go ./
# Embed the built frontend
COPY --from=frontend /app/dist ./static
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o ledgerlift .

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /data
COPY --from=builder /app/ledgerlift /usr/local/bin/ledgerlift
VOLUME ["/data"]
ENV DB_PATH=/data/ledgerlift.db
ENV PORT=9090
EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:9090/api/health || exit 1
CMD ["ledgerlift"]
