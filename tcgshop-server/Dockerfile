FROM node:22-alpine
WORKDIR /app
COPY server.js sync-core.js sync-http.js sync-delta.js sync-store.js updates.js pickup-core.js pickups.js packing.js ./
COPY packing-web ./packing-web
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
