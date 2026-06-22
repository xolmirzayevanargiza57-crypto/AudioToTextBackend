FROM node:20-alpine

WORKDIR /app

# Paketlar ro'yxatini ko'chirib o'tamiz
COPY package*.json ./

# Kerakli kutubxonalarni yuklaymiz
RUN npm ci

# Hamma kodlarni (server.js va h.k.) ko'chiramiz
COPY . .

# Server ishlaydigan port (Render odatda 10000 ishlatadi)
EXPOSE 10000

# Loyihani ishga tushiramiz
CMD ["node", "server.js"]
