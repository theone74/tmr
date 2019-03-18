### Запуск:

`npm install`
`RUN=1 SERVER=1 node index.js`

```
docker run -d --name=tmr \
	--restart=always \
	-e RUN=1 \
	-e SERVER=1 \
	-e PORT=3000 \
	theone74/tmr
```



### Возможные константы:

* RUN=1|0  - сбор данных сразу после запуска
* SERVER=1|0 - запуск встроенного сервера на порту `PORT`
* PORT=X - порт встроенного вебсервера
* INTERVAL="10:00,…" - значение времени когда будут пересобраны данные
* RSS_URL=url - адрес фида
* BASICAUTH=login:pass - вебсервер требует авторизации