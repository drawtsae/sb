# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 and @node-rs/argon2 ship prebuilt binaries for linux-x64/arm64 glibc.
# If npm ever has to compile them, add: apt-get install -y python3 make g++
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build, then serwist build (writes public/sw.js)
RUN npm run build
# Standalone-friendly create-user CLI. Native modules stay external and are resolved
# from the standalone node_modules at runtime.
RUN npx esbuild scripts/create-user.ts --bundle --platform=node --target=node24 --format=cjs \
    --external:better-sqlite3 --external:@node-rs/argon2 --outfile=dist-scripts/create-user.js

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Order matters: public/ must be copied AFTER the standalone output, from the build stage
# after `npm run build`, so that it contains the fresh sw.js written by serwist
# (next build copies public/ into standalone BEFORE serwist runs).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist-scripts ./dist-scripts
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
