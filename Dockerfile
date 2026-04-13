FROM node:20-slim

# Install ffmpeg for frame extraction
RUN apt-get update && apt-get install -y ffmpeg python3 pip && pip install --break-system-packages yt-dlp && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Auto-update yt-dlp on every container start (TikTok changes URLs frequently)
CMD pip install --break-system-packages -U yt-dlp && node src/index.js
