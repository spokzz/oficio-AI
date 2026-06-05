# syntax = docker/dockerfile:1

ARG NODE_VERSION=20.19.0
FROM node:${NODE_VERSION}-slim

WORKDIR /app

ENV NODE_ENV="production"
ENV OFICIO_VOICE_GATEWAY_PORT="8787"

COPY package-lock.json package.json ./
RUN npm ci --omit=dev

COPY scripts ./scripts
COPY shared ./shared

EXPOSE 8787

CMD [ "npm", "run", "voice:realtime" ]
