# Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

# Copie des fichiers package.json et installation des dépendances
COPY package*.json ./


RUN npm install

# Copie du code source
COPY . .

# Ajout des commandes de débogage après le build
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]