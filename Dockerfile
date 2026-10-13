FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.js marketplace.js operations.js catalog.js real-catalog.js ./
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/store.sqlite NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
