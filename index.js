const https = require('https');
const http = require('http');
const util = require('util');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');



const DAYS = 60
const KINOPOISK_UUID = crypto.randomBytes(16).toString('hex'); //"6730382b7a236cd964264b49413ed00f" //Генерируется автоматически в main
const KINOPOISK_CLIENTID = crypto.randomBytes(12).toString('hex'); //Генерируется автоматически в main
const KINOPOISK_API_SALT = "IDATevHDS7";
const KINOPOISK_BASE_URL = "https://ma.kinopoisk.ru";
const KINOPOISK_DOMAIN = "ma.kinopoisk.ru";
const KINOPOISK_API_RELEAESES = "/k/v1/films/releases/digital?digitalReleaseMonth=%s&limit=1000&offset=0&uuid=%s";
const KINOPOISK_BASE_URL2 = "/ios/5.0.0/";
const KINOPOISK_API_FILMDETAIL = "getKPFilmDetailView?still_limit=9&filmID=%i&uuid=%s";
const POSTER_URL = "https://st.kp.yandex.net/images/{}{}width=360";
const RUTOR_DOMAIN = "rutor.info";
const RUTOR_BASE_URL = "/search/0/0/010/0/film%20";
const SAVE_PATH = "./data";
const SOCKS_IP = process.env.SOCKS_IP || "";
const SOCKS_PORT = process.env.SOCKS_PORT || 0;
const RSS_URL = process.env.RSS_URL || 'url';
const RSS_EMAIL = process.env.RSS_EMAIL || 'rss@example.com';
const RSS_TTL = process.env.RSS_TTL || 30;
const INTERVAL = process.env.INTERVAL || '';
const SERVER = parseInt(process.env.SERVER || 0);
const RUN = parseInt(process.env.RUN || 0);

// console.log(RUN, !!RUN);

// https://stackoverflow.com/a/10647272
function dateFormat (date, fstr, utc) {
	utc = utc ? 'getUTC' : 'get';
	return fstr.replace (/%[YmdHMS]/g, function (m) {
		switch (m) {
			case '%Y': return date[utc + 'FullYear'] (); // no leading zeros required
			case '%m': m = 1 + date[utc + 'Month'] (); break;
			case '%d': m = date[utc + 'Date'] (); break;
			case '%H': m = date[utc + 'Hours'] (); break;
			case '%M': m = date[utc + 'Minutes'] (); break;
			case '%S': m = date[utc + 'Seconds'] (); break;
			default: return m.slice (1); // unknown code, remove %
		}
		// add leading zero if required
		return ('0' + m).slice (-2);
	});
}

function doRequest(options) {
	const proto = options.protocol || 'http:';
	console.log('START REQUEST', util.format('%s %s//%s%s', options.method || 'GET', proto, options.host, options.path));
	return new Promise ((resolve, reject) => {
		let req = (proto === 'http:' ? http : https).request(options);
		let buffer = '';

		req.on('response', res => {
			if (res.headers['content-encoding'] == 'gzip') {
				let gunzip = zlib.createGunzip();
				res.pipe(gunzip);
				gunzip
					.on('data', (data) => {buffer += data.toString()})
					.on("end", ()      => {resolve([buffer, res.statusCode, res.headers])})
					.on("error", e     => {reject(e)})
			}
			else {
				res.setEncoding('utf8');
				res.on('data', chunk => {buffer += chunk});
				res.on('end', () => {resolve([buffer, res.statusCode, res.headers])});
			}
		});
	
		req.on('error', e => {
			reject(e);
		});

		req.end();
	}); 
}


async function digitalReleases(){

	let movieKeeper = [];

	currentDate = Date.now();
	console.log("Текущая дата: ", dateFormat(new Date(currentDate), '%d.%m.%Y'));
	let downloadDates = [];
	const targetDate = currentDate - 60 * 24 * 60 * 60 * 1000;
	console.log("Целевая дата: ", dateFormat(new Date(targetDate), '%d.%m.%Y'));
	let iterationDate = currentDate;

	while(targetDate < iterationDate) {
		downloadDates.push(iterationDate);
		iterationDate -= 24 * 60 * 60 * 1000;
	}

	downloadDates = downloadDates.map(d=>dateFormat(new Date(d), '%m.%Y')).filter((v, i, a) => a.indexOf(v) === i);	

	for(const downloadDate of downloadDates) {
		
		const requestMethod = util.format(KINOPOISK_API_RELEAESES, downloadDate, KINOPOISK_UUID);
		const timestamp = Date.now();
		const hashString = requestMethod + timestamp + KINOPOISK_API_SALT;

		const options = {
			host:     KINOPOISK_DOMAIN,
			port:     443,
			path:     requestMethod,
			method:   'GET',
			protocol: 'https:',
			headers: {
				"Accept-encoding":     "gzip",
				"Accept":              "application/json",
				"User-Agent":          "Android client (6.0.1 / api23), ru.kinopoisk/4.6.5 (86)",
				"Image-Scale":         "3",
				"device":              "android",
				"ClientId":            KINOPOISK_CLIENTID,
				"countryID":           "2",
				"cityID":              "1",
				"Android-Api-Version": "23",
				"clientDate":          dateFormat(new Date(), "%H:%M %d.%m.%Y"),
				"X-TIMESTAMP":         timestamp,
				"X-SIGNATURE":         crypto.createHash('md5').update(hashString).digest("hex") //hashlib.md5(hashString.encode('utf-8')).hexdigest(),
			}
		};

		let data, status;

		try{
			// TODO parallel work
			[data, status] = await doRequest(options); //.then(([str, status])=>{console.log(JSON.parse(str), status)});
			if (status != 200) {
				console.error("Can't read", requestMethod);
				process.exit(1);
			}
			data = JSON.parse(data);
		}
		catch (e) {
			console.error("Can't read", requestMethod);
			console.error(e);
			process.exit(1);
		}

		if (typeof data != 'object' || data.success != true) {
			console.error("Unsuccessful response from", requestMethod);
			console.dir(data, {depth: null});
			process.exit(1);
		}
		if (typeof data['data'] != 'object' || !Array.isArray(data['data']['items'])) {
			console.error("Invalid data from", requestMethod);
			console.dir(data, {depth: null});
			process.exit(1);
		}

		// console.dir(data, {depth: null});
		for(const film of data['data']['items']) {
			const filmId = film['id'];
			const contextData = film['contextData'];
			const releaseDate = new Date(contextData['releaseDate']).getTime();
			// TODO check film params
			if (targetDate <= releaseDate <= currentDate) {
				movieKeeper.push(filmId);
				// console.log('Added', film['title']);
			}
		}

		// break;

	}


	return movieKeeper;
}

async function filmDetail(filmId) {

	const requestMethod = util.format(KINOPOISK_API_FILMDETAIL, filmId, KINOPOISK_UUID);
	const timestamp = Date.now();
	const hashString = requestMethod + timestamp + KINOPOISK_API_SALT;

	const options = {
		host:     KINOPOISK_DOMAIN,
		port:     443,
		path:     KINOPOISK_BASE_URL2 + requestMethod,
		method:   'GET',
		protocol: 'https:',
		headers: {
			"Accept-encoding":     "gzip",
			"Accept":              "application/json",
			"User-Agent":          "Android client (6.0.1 / api23), ru.kinopoisk/4.6.5 (86)",
			"Image-Scale":         "3",
			"device":              "android",
			"ClientId":            KINOPOISK_CLIENTID,
			"countryID":           "2",
			"cityID":              "1",
			"Android-Api-Version": "23",
			"clientDate":          dateFormat(new Date(), "%H:%M %d.%m.%Y"),
			"X-TIMESTAMP":         timestamp,
			"X-SIGNATURE":         crypto.createHash('md5').update(hashString).digest("hex") //hashlib.md5(hashString.encode('utf-8')).hexdigest(),
		}
	};

	try{
		[data, status] = await doRequest(options); //.then(([str, status])=>{console.log(JSON.parse(str), status)});
		if (status != 200) {
			console.error("Can't read", requestMethod);
			console.error(data);
			process.exit(1);
		}
		data = JSON.parse(data);
		// TODO check fields
		return data;
	}
	catch (e) {
		console.error("Can't read", requestMethod);
		console.error(e);
		process.exit(1);
	}
}

async function rutorLinks(filmId) {
	const options = {
		host:     RUTOR_DOMAIN,
		port:     80,
		path:     RUTOR_BASE_URL + filmId,
		method:   'GET',
		protocol: 'http:',
		headers: {
			"Accept-encoding":     "gzip",
			"User-Agent":          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:65.0) Gecko/20100101 Firefox/65.0",
		}
	};

	try{
		[data, status] = await doRequest(options); //.then(([str, status])=>{console.log(JSON.parse(str), status)});
		if (status != 200) {
			console.error("Can't read rutor");
			console.error(data);
			process.exit(1);
		}
		// data = JSON.parse(data);
		// TODO check fields
		// return data;
	}
	catch (e) {
		console.error("Can't read rutor");
		console.error(e);
		process.exit(1);
	}

	if (data.indexOf("<div id=\"index\">") < 0) {
		return false;
	}
	data = data.substr(data.indexOf("<div id=\"index\">"));

	const finalResult = [];
	//"<a class=\"downgif\" href=\"(.*?)\">"

	//  /^<td.*?>.*?"downgif"\s+href="(.*?)">.*?<a\s+href="\/torrent\/.*?>(.*?)<\/a>.*?<\/td>.*?alt="S".*?(\d+)<\/span>/gms
	const re = /^<td.*?>.*?"downgif"\s+href="(.*?)">.*?<a\s+href="\/torrent\/.*?>(.*?)<\/a>.*?<\/td>.*?alt="S".*?(\d+)<\/span>/gms;
	for (let match; (match = re.exec(data)) !== null;) {

		let [link, name, seeders] = [match[1], match[2], match[3]].map(x => x.trim());

		let [realName, ...tmptags] = name.split('|');
		let tags = [];
		let result = {};
		realName = realName.toUpperCase();
		tmptags.forEach(t=>tags.push(...t.toUpperCase().split(',')));
		tags = tags.map(x => x.trim());

		

		if (tags.includes('LINE') || tags.includes('UKR') || tags.includes('3D-VIDEO') || tags.includes('60 FPS'))
		continue;
		
		if (!(tags.includes('ЛИЦЕНЗИЯ') || tags.includes('ITUNES') || tags.includes('D') || tags.includes('D2')))
		continue
		
		// console.log(realName, tags, seeders);

		if (realName.includes('UHD BDREMUX')) {
			if (tags.includes('HDR')) {
				if (result['UHD BDRemux HDR']) {
					if (seeders > result['UHD BDRemux HDR']['seeders']) {
						result['UHD BDRemux HDR']['link'] = link;
						result['UHD BDRemux HDR']['seeders'] = seeders;
						result['UHD BDRemux HDR']['name'] = name;
					}
				}
				else {
					result['UHD BDRemux HDR'] = {link, seeders, name};
				}
			}
			else if (result['UHD BDRemux SDR']) {
				if (seeders > result['UHD BDRemux SDR']['seeders']) {
					result['UHD BDRemux SDR']['link'] = link;
					result['UHD BDRemux SDR']['seeders'] = seeders;
					result['UHD BDRemux SDR']['name'] = name;
				}
				else {
					result['UHD BDRemux SDR'] = {link, seeders, name};
				}
			}
		}
		else if (realName.includes('BDREMUX')) {
			if (result['BDRemux']) {
				if (seeders > result['BDRemux']['seeders']) {
					result['BDRemux']['link'] = link;
					result['BDRemux']['seeders'] = seeders;
					result['BDRemux']['name'] = name;
				}
			}
			else {
				result['BDRemux'] = {link, seeders, name};
			}
		}
		else if (realName.includes('BDRIP') && realName.includes('HEVC') && realName.includes('1080')) {
			if (result['BDRip-HEVC 1080p']) {
				if (seeders > result['BDRip-HEVC 1080p']['seeders']) {
					result['BDRip-HEVC 1080p']['link'] = link;
					result['BDRip-HEVC 1080p']['seeders'] = seeders;
					result['BDRip-HEVC 1080p']['name'] = name;
				}
			}
			else {
				result['BDRip-HEVC 1080p'] = {link, seeders, name};
			}
		}
		else if (realName.includes('BDRIP') && realName.includes('1080')) {
			if (result['BDRip 1080p']) {
				if (seeders > result['BDRip 1080p']['seeders']) {
					result['BDRip 1080p']['link'] = link;
					result['BDRip 1080p']['seeders'] = seeders;
					result['BDRip 1080p']['name'] = name;
				}
			}
			else {
				result['BDRip 1080p'] = {link, seeders, name};
			}
		}
		else if (realName.includes('WEB-DL') && realName.includes('2160')) {
			if (tags.includes('HDR')) {
				if (result['WEB-DL 2160p HDR']) {
					if (seeders > result['WEB-DL 2160p HDR']['seeders']) {
						result['WEB-DL 2160p HDR']['link'] = link;
						result['WEB-DL 2160p HDR']['seeders'] = seeders;
						result['WEB-DL 2160p HDR']['name'] = name;
					}
				}
				else {
					result['WEB-DL 2160p HDR'] = {link, seeders, name};
				}
			}
			else if (result['WEB-DL 2160p SDR']) {
				if (seeders > result['WEB-DL 2160p SDR']['seeders']) {
					result['WEB-DL 2160p SDR']['link'] = link;
					result['WEB-DL 2160p SDR']['seeders'] = seeders;
					result['WEB-DL 2160p SDR']['name'] = name;
				}
			}
			else {
				result['WEB-DL 2160p SDR'] = {link, seeders, name};
			}
		}
		else if (realName.includes('WEB-DL') && realName.includes('1080')) {
			if (result['WEB-DL 1080p']) {
				if (seeders > result['WEB-DL 1080p']['seeders']) {
					result['WEB-DL 1080p']['link'] = link;
					result['WEB-DL 1080p']['seeders'] = seeders;
					result['WEB-DL 1080p']['name'] = name;
				}
			}
			else {
				result['WEB-DL 1080p'] = {link, seeders, name};
			}
		}

		if (result['UHD BDRemux HDR'] && result['UHD BDRemux SDR'] && result['BDRip-HEVC 1080p'] && result['BDRip 1080p'] ) {
			delete(result['WEB-DL 2160p HDR']);
			delete(result['WEB-DL 2160p SDR']);
			delete(result['WEB-DL 1080p']);
		}

		if (result['WEB-DL 1080p']) {
			finalResult.push({link: result['WEB-DL 1080p']['link'], name: result['WEB-DL 1080p']['name'], type: 'WEB-DL 1080p'});
		}
		if (result['WEB-DL 2160p SDR']) {
			finalResult.push({link: result['WEB-DL 2160p SDR']['link'], name: result['WEB-DL 2160p SDR']['name'], type: 'WEB-DL 2160p SDR'});
		}
		if (result['WEB-DL 2160p HDR']) {
			finalResult.push({link: result['WEB-DL 2160p HDR']['link'], name: result['WEB-DL 2160p HDR']['name'], type: 'WEB-DL 2160p HDR'});
		}
		if (result['BDRip 1080p']) {
			finalResult.push({link: result['BDRip 1080p']['link'], name: result['BDRip 1080p']['name'], type: 'BDRip 1080p'});
		}
		if (result['BDRip-HEVC 1080p']) {
			finalResult.push({link: result['BDRip-HEVC 1080p']['link'], name: result['BDRip-HEVC 1080p']['name'], type: 'BDRip-HEVC 1080p'});
		}
		if (result['BDRemux']) {
			finalResult.push({link: result['BDRemux']['link'], name: result['BDRemux']['name'], type: 'BDRemux'});
		}
		if (result['UHD BDRemux SDR']) {
			finalResult.push({link: result['UHD BDRemux SDR']['link'], name: result['UHD BDRemux SDR']['name'], type: 'UHD BDRemux SDR'});
		}
		if (result['UHD BDRemux HDR']) {
			finalResult.push({link: result['UHD BDRemux HDR']['link'], name: result['UHD BDRemux HDR']['name'], type: 'UHD BDRemux HDR'});
		}
	
	}

	return finalResult;
}


async function saveRSS(movies){
	let rss = `<?xml version="1.0" encoding="UTF-8"?>
	<rss version="2.0">
		<channel>
			<title>Новые цифровые релизы</title>
			<link>${RSS_URL}</link>
			<description>Новые цифровые релизы</description>
			<language>ru</language>
			<managingEditor>${RSS_EMAIL}</managingEditor>
			<generator>torrentMovieReleases</generator>
			<pubDate>${new Date().toGMTString()}</pubDate>
			<lastBuildDate>${new Date().toGMTString()}</lastBuildDate>
			<ttl>${RSS_TTL}</ttl>`;

	for(const movie of movies) {
		let [day, month, year] = movie.data.rentData.premiereDigital.split('.').map(p=>parseInt(p));
		// new Date(year, month, day)
		// console.log(day, month, year);
		for(const torrent of movie.torrents) {
			let pubDate = new Date(year, month-1, day, (new Date()).getTimezoneOffset() / 60 * -1);
			rss += `<item>
			<pubDate>${pubDate.toGMTString()}</pubDate>
				<title>
					<![CDATA[${movie.data.nameRU} (${movie.data.genre}) (${torrent.type})]]>
				</title>
				<guid>${movie.data.webURL}#${pubDate.getTime()}-${torrent.type.replace(' ', '_')}</guid>
				<link>${torrent.link}</link>
				<author>kinopoisk</author>
				<description>
					<![CDATA[
						<img src="https://st.kp.yandex.net/images/${movie.data.bigPosterURL}" alt="lostfilm.tv" style="vertical-align: middle;" />
						<h1>${movie.data.nameRU} (${movie.data.nameEN}) (${movie.data.year})</h1>
						<pre>${movie.data.description}</pre>
					]]>
				</description>
			</item>`;
		}
		// console.log(movie);
	}

	rss += '</channel></rss>';

	if (!fs.existsSync(SAVE_PATH)) {
		fs.mkdirSync(SAVE_PATH, {recursive: true});
	}

	fs.writeFileSync(path.join(SAVE_PATH, 'info.rss'), rss);
}


async function build() {
	const releases = await digitalReleases();
	let movies = [];

	for(const filmId of releases) {
		const torrents = await rutorLinks(filmId)
		if (!Array.isArray(torrents) || torrents.length == 0) continue;

		const detail = await filmDetail(filmId);
		detail["torrents"] = torrents;
		movies.push(detail);
	}

	// movies.sort(key = operator.itemgetter("ratingFloat"), reverse = True)
	movies = movies.sort((a,b)=>{
		let [aday, amonth, ayear] = a.data.rentData.premiereDigital.split('.').map(p=>parseInt(p));
		let apubDate = new Date(ayear, amonth-1, aday, (new Date()).getTimezoneOffset() / 60 * -1).getTime();
		let [bday, bmonth, byear] = b.data.rentData.premiereDigital.split('.').map(p=>parseInt(p));
		let bpubDate = new Date(byear, bmonth-1, bday, (new Date()).getTimezoneOffset() / 60 * -1).getTime();
		return bpubDate - apubDate;
	})
	saveRSS(movies);
}


// first run
if (RUN) {
	build();
}


// scheduler
if (INTERVAL) {
	setInterval(()=>{
		if (INTERVAL.split(',').includes(dateFormat(new Date(), '%H:%M'))) {
			// console.log('time!');
			build();
		}
	}, 60000)
}


// web server
if (SERVER){
	http.createServer(function (request, response) {
		console.log('requested', request.url);
	
		var filePath = '.' + request.url;
	
		switch (filePath) {
			case './': {
				filePath = './info.html';
			} break;
			case './rss':
			case './rss/': {
				filePath = './info.rss';
			} break;
			default: {
				response.writeHead(404);
				response.end('', 'utf-8');
			} break;
		}	
	
		var extname = path.extname(filePath);
		var contentType = 'text/html';
		switch (extname) {
			case '.rss':
				contentType = 'application/rss+xml';
				break;
			case '.html':
				contentType = 'text/html';
				break;
		}
	
	
	
		fs.readFile(path.join(SAVE_PATH, filePath), function(error, content) {
			if (error) {
				if(error.code == 'ENOENT'){
					// fs.readFile('./404.html', function(error, content) {
					// 	response.writeHead(200, { 'Content-Type': contentType });
					// 	response.end(content, 'utf-8');
					// });
					response.writeHead(404);
					response.end('', 'utf-8');
				}
				else {
					response.writeHead(500);
					response.end('error\n');
				}
			}
			else {
				response.writeHead(200, { 'Content-Type': contentType });
				response.end(content, 'utf-8');
			}
		});
	
	
	}).listen(8125);
}