FROM node:slim

ENV NODE_ENV production

RUN mkdir /opt/app \
    && apt-get update  \
    && apt-get install -y git \
    && apt-get purge -y --auto-remove

COPY . /opt/app

WORKDIR /opt/app

RUN npm install --no-optional

VOLUME /opt/app/config
VOLUME /opt/app/shared_volume

EXPOSE 9000

ENTRYPOINT ./node_modules/.bin/babel-node index.js
