FROM node:18-alpine

# Crée le répertoire de travail
WORKDIR /usr/src/app

# Copie les fichiers package.json et package-lock.json
COPY package*.json ./

# Installe les dépendances
RUN npm install

# Copie le reste de l'application
COPY . .

# Compile l'application
RUN npm run build

# Expose le port
EXPOSE 3000

# Commande pour démarrer l'application
CMD ["npm", "run", "start:prod"]