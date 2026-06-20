# Liftoff builds this with the "Dockerfile" build strategy and pushes it to your
# DigitalOcean Container Registry. App Platform sets PORT at runtime; the app
# reads it (defaults to 3000 locally).
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
