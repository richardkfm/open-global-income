# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm pkg delete scripts.postinstall && npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm pkg delete scripts.postinstall && npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/data/countries.json ./dist/data/countries.json
COPY src/data/regions.json ./dist/data/regions.json
COPY public ./public
EXPOSE 3333
CMD ["node", "dist/index.js"]
