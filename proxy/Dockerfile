FROM node:20-alpine

WORKDIR /proxy

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 80

# --watch is for local dev only (bind-mounted source hot-reloads).
# The GHCR image runs plain node — no file watcher overhead in production.
CMD ["node", "server.js"]
