# Dockerfile for IG MCP Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (using install instead of ci since we don't have lock file yet)
RUN npm install

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Set as executable
RUN chmod +x dist/index.js

# Expose port (not used for stdio, but Railway might need it)
EXPOSE 3000

# Run the server
CMD ["node", "dist/index.js"]

