FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
EXPOSE 8080

CMD ["node", "src/server.js"]
