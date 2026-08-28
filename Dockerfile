FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server ./server
COPY --from=builder /app/dist ./dist

EXPOSE 4000
ENV PORT=4000
ENV NODE_OPTIONS=--max-old-space-size=256
CMD ["node", "server/index.cjs"]
