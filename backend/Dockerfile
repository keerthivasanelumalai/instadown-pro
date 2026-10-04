FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ffmpeg \
        ca-certificates \
        curl \
    && pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default]" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY backend .
COPY frontend ./frontend

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
