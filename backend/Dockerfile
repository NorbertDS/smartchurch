FROM node:22-slim AS build
WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm ci

# Copy source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Runtime image
FROM node:22-slim AS runtime
WORKDIR /app

# Copy only necessary files
COPY --from=build /app/ /app/

# Ensure runtime directories exist for persistence
RUN mkdir -p /app/uploads \
    && mkdir -p /app/prisma/data \
    && mkdir -p /app/prisma/backups

ENV NODE_ENV=production
ENV PORT=4000

# Expose backend port
EXPOSE 4000

CMD ["node", "dist/index.js"]

