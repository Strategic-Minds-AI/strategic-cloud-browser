FROM node:24-alpine

# Build from repository root; worker imports ../shared/db.js.
WORKDIR /app

COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY worker/ ./worker/
COPY shared/ ./shared/

ENV NODE_ENV=production
USER node
CMD ["node", "worker/worker.js"]
