FROM node:11.11.0-alpine
WORKDIR /app
RUN mkdir -p /app/data
ADD index.js /app
ADD package.json /app
RUN cd /app && yarn
CMD [ "/usr/local/bin/npx", "pm2", "start", "index.js" ]
