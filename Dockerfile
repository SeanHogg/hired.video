# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy frontend package files and install dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

# Copy only the frontend source and shared libraries
COPY frontend ./frontend
COPY shared ./shared

# Build the application (uses frontend build scripts)
RUN cd frontend && npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install serve to run the production build
RUN npm install -g serve

# Copy built application from builder
COPY --from=builder /app/frontend/dist ./dist
COPY --from=builder /app/frontend/public ./public

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["serve", "-s", "dist", "-l", "3000"]

