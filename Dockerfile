FROM node:22-alpine

WORKDIR /app

# Copy server package files and install deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Copy server code
COPY server/ ./server/

# Copy pre-built client dist
COPY client/dist/ ./client/dist/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 8080

CMD ["node", "server/index.js"]
