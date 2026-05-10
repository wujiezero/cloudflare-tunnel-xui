FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --omit=dev

COPY . .

RUN npm run build

RUN chmod +x /app/bin/cloudflared 2>/dev/null || true
RUN chmod +x /app/scripts/*.sh 2>/dev/null || true

EXPOSE 8866

CMD ["npm", "start"]
