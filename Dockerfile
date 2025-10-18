# Dockerfile
# Stage 1: Install wstcp через cargo
FROM rust:1.83-slim AS wstcp-builder

RUN cargo install wstcp && \
    cp /usr/local/cargo/bin/wstcp /wstcp

# Stage 2: Runtime
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

# Встановити системні залежності
RUN apt-get update && apt-get install -y \
    curl \
    netcat-openbsd \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Копіювати wstcp з builder stage
COPY --from=wstcp-builder /wstcp /usr/local/bin/wstcp
RUN chmod +x /usr/local/bin/wstcp && \
    /usr/local/bin/wstcp --version

# Копіювати package files
COPY package*.json ./
RUN npm ci

# Встановити Playwright
RUN npx playwright install chromium firefox --with-deps

# Копіювати код і білд
COPY . .
RUN npm run build:test

# Створити директорії
RUN mkdir -p output/proofs output/temp

# Копіювати startup script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001 55688

ENV NODE_ENV=production \
    PORT=3001 \
    PROOFS_DIR=/app/output/proofs \
    BROWSER_HEADLESS=true \
    NOTARY_URL=http://notary-server:7047

CMD ["/usr/local/bin/docker-entrypoint.sh"]