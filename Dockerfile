# --- Stage 1: build the PWA frontend ---
FROM node:20-alpine AS client-build
WORKDIR /app/client

# VITE_API_TOKEN is inlined into the static bundle at build time, so it must
# be available here (set it as a variable in Railway — it's forwarded as a
# build arg automatically for Dockerfile deploys).
ARG VITE_API_TOKEN
ENV VITE_API_TOKEN=$VITE_API_TOKEN

COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: the API + static server ---
# firebase-admin's Google Cloud client libraries (@google-cloud/firestore,
# @google-cloud/storage — optionalDependencies) are built/published against
# glibc; npm silently skips them on Alpine's musl libc, which built fine but
# crashed at startup with "Cannot find module '@google-cloud/firestore'".
# Debian slim avoids that whole class of issue.
FROM node:20-bookworm-slim AS server
WORKDIR /app

COPY server/package*.json server/
RUN cd server && npm install --omit=dev

COPY server/ server/
COPY --from=client-build /app/client/dist client/dist

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/src/index.js"]
