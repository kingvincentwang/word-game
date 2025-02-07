FROM node:latest
LABEL name="word-game"
LABEL version="1.0"

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 3000

CMD ["npm", "run", "dev"]