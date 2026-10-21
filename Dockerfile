FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/drawdb.sqlite
# The server shells out to git for diagram repository sync, and needs an SSH
# client plus CA certificates to reach remotes. Install before copying app
# files so source changes reuse this layer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN install -d -o node -g node /data
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/collaboration ./src/collaboration
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
