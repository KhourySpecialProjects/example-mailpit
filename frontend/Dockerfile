FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# Vite dev server with hot reload (source is bind-mounted by compose).
CMD ["node_modules/.bin/vite"]
