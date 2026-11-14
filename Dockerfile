FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data
ENV PORT=8080 NODE_OPTIONS=--max-old-space-size=400
EXPOSE 8080
CMD ["node", "src/server.js", "--http"]
