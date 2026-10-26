# Container build for the center's own servers (Klinikat). Two images from one file:
#   docker build -f deploy/Dockerfile --target api -t vwelfare-api .
#   docker build -f deploy/Dockerfile --target web -t vwelfare-web .
# deploy/compose.yaml runs both with PostgreSQL. Vercel previews don't use this file.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mock-emr/package.json apps/mock-emr/
RUN npm ci --no-audit --no-fund && mkdir -p apps/api/node_modules

FROM deps AS web-build
COPY tsconfig.base.json vercel.json ./
COPY apps/web apps/web
RUN npm run build -w @vwelfare/web

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production APP_ENV=production API_HOST=0.0.0.0 API_PORT=4000 DATA_DIR=/data COOKIE_SECURE=true
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY package.json tsconfig.base.json ./
COPY apps/api apps/api
# Uploaded files are stored encrypted under /data/files: mount it on the center's storage.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4000
CMD ["node_modules/.bin/tsx", "apps/api/src/server.ts"]

FROM nginx:1.28-alpine AS web
COPY deploy/websocket.conf /etc/nginx/conf.d/00-websocket.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
