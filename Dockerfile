# Dockerfile for IG MCP Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set as executable
RUN chmod +x dist/index.js

# Expose port (not used for stdio, but Railway might need it)
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]

