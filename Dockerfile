FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY server.js seed-products.json ./
COPY public ./public
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
