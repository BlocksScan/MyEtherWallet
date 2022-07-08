FROM node:12-stretch
RUN apt update
RUN apt install nasm -y 
RUN apt install libnss3-dev libgdk-pixbuf2.0-dev libgtk-3-dev libxss-dev -y 
ENV HOME /home
ENV NODE_OPTIONS --max-old-space-size=8192
RUN npm install npm@6.14 -g
RUN node -v && npm -v
COPY package*.json ./
COPY package-audit.js ./
RUN  node package-audit.js
RUN rm package-audit.js
RUN rm -rf package*.json*
WORKDIR /home

EXPOSE 8080
