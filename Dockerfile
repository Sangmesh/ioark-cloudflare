FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
# Corporate TLS-intercepting proxies present a self-signed chain to the registry
# and often reset long-lived connections. Relax strict-ssl (build-only) and make
# the install resilient to transient ECONNRESET with retries + generous timeouts.
RUN npm config set strict-ssl false \
    && npm config set fetch-retries 8 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 180000 \
    && npm config set fetch-timeout 600000 \
    && npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Single-origin config: serves the SPA and proxies API/OIDC/SCIM to the backend
# (replaces the standalone proxy container).
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3007
