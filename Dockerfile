# syntax=docker/dockerfile:1

# ---- base ---------------------------------------------------------------
# node:24 ships a stable `node:sqlite` (no ExperimentalWarning), and still runs
# the Postgres driver just fine.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3131 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
    else npm install --omit=dev --no-audit --no-fund; fi

# Application code.
COPY server ./server
COPY public ./public

# Writable data dir for the SQLite fallback, owned by the unprivileged user.
# tzdata lets TZ= work inside the container (used for the automatic date stamps).
RUN apk add --no-cache tzdata && mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node

EXPOSE 3131

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3131)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
