FROM node:22-alpine

RUN apk add --no-cache \
    docker-cli \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5000

CMD ["npm", "start"]