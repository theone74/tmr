FROM keymetrics/pm2:latest-alpine
USER node
WORKDIR /app
RUN mkdir -p /app/data
ADD index.js /app
ADD package.json /app
RUN cd /app && yarn
#CMD [ "/usr/local/bin/npx", "pm2", "start", "index.js" ]
