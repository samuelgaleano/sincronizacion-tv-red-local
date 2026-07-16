# Imagen para la demo del sistema de señalización (Node + Express + Socket.io).
# App Node simple; se dockeriza para correr de forma reproducible (Render con Docker,
# igual que el POS). El servidor escucha en process.env.PORT (Render lo define).
FROM node:20-alpine

WORKDIR /app

# Solo dependencias de producción, con la capa cacheada por package*.json.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Código de la app (uploads/node_modules quedan fuera vía .dockerignore).
COPY --chown=node:node . .

USER node
EXPOSE 3000
CMD ["node", "server.js"]
