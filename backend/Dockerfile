FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src ./src
COPY .env.example ./.env
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node","src/index.js"]
