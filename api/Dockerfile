FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
# Development image: restarts on source changes (source is bind-mounted by compose).
CMD ["node", "--watch", "src/server.js"]
