FROM node:24-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=@aulapay/web --include-workspace-root

FROM dependencies AS development
COPY frontend ./frontend
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@aulapay/web", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS build
COPY frontend ./frontend
RUN npm run build --workspace=@aulapay/web

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
EXPOSE 3000
CMD ["node", "frontend/server.js"]
