FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG INTERNAL_API_URL=http://api:8000
ENV INTERNAL_API_URL=$INTERNAL_API_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/vano04/RunTrace"
LABEL org.opencontainers.image.description="RunTrace web dashboard"
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown -R node:node .next/cache
EXPOSE 3000
USER node
CMD ["node", "server.js"]
