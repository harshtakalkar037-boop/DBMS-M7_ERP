# --------------------------------------------------------------------------- #
# University ERP — web image (Vite dev server, proxying /api to the API)
# --------------------------------------------------------------------------- #
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Inside Compose the API is reachable as the service `api`; locally it is
# 127.0.0.1:8080. The browser still only ever requests /api (relative).
ARG VITE_API_TARGET=http://api:8080
ENV VITE_API_TARGET=$VITE_API_TARGET

EXPOSE 5173
CMD ["npm", "run", "dev"]
