FROM node:22-alpine
WORKDIR /app
COPY server.js sync-core.js sync-http.js updates.js ./
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
