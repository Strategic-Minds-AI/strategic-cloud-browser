FROM node:24-alpine

# Railway must use the repository root as its Docker build context.
# The API imports ../shared/db.js; copying api/ alone silently breaks runtime imports.
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# The API and shared code must be siblings so ../../shared/db.js resolves.
COPY api/ ./api/
COPY shared/ ./shared/

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000

USER node
CMD ["node", "api/server.js"]
