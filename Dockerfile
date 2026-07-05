# syntax=docker/dockerfile:1
FROM node:20-slim

# Fonts so the server-side score-trend chart can render axis labels.
# node:20-slim ships none, which would make canvas text invisible.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

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
