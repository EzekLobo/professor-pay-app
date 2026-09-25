FROM node:24-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=@aulapay/web --include-workspace-root

FROM dependencies AS development
COPY apps/web ./apps/web
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@aulapay/web", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS build
COPY apps/web ./apps/web
RUN npm run build --workspace=@aulapay/web

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
