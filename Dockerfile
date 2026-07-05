# syntax=docker/dockerfile:1
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Run as a non-root user for security
RUN useradd --create-home --shell /bin/bash bot && chown -R bot:bot /app
USER bot

# Start the bot
CMD ["node", "src/index.js"]
