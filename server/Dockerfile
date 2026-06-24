FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npx tsc

EXPOSE 3001
CMD ["npm", "run", "dev"]
