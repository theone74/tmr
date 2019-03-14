FROM keymetrics/pm2:latest-alpine
USER node
WORKDIR /home/node
ADD index.js ./
ADD package.json ./
ADD pm2.json ./
RUN yarn
#CMD [ "/usr/local/bin/npx", "pm2", "start", "index.js" ]