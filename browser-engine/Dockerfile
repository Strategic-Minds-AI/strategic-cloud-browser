FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Consistent repo-root Docker build context for all three CloudBrowser services.
COPY browser-engine/package.json browser-engine/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
RUN npx playwright install chromium

COPY browser-engine/server.js ./
COPY browser-engine/network-policy.js ./
COPY browser-engine/session-manager.js ./
COPY browser-engine/extract-content.js ./
COPY browser-engine/fingerprint-randomizer.js ./
COPY browser-engine/human-behavior.js ./

ENV NODE_ENV=production
ENV PORT=8080
ENV MAX_SESSIONS=10
ENV DEFAULT_TIMEOUT=30000
ENV SESSION_TTL_MS=300000

EXPOSE 8080
CMD ["node", "server.js"]
