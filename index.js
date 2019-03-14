const https = require('https');
const http = require('http');
const util = require('util');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const ProxyAgent = require('proxy-agent');



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
const RSS_URL = process.env.RSS_URL || 'url';
const RSS_EMAIL = process.env.RSS_EMAIL || 'rss@example.com';
const RSS_TTL = process.env.RSS_TTL || 30;
const INTERVAL = process.env.INTERVAL || '';
const SERVER = parseInt(process.env.SERVER || 0);
const RUN = parseInt(process.env.RUN || 0);
const PORT = parseInt(process.env.PORT || 3000);
const RUTOR_SLEEP = parseInt(process.env.RUTOR_SLEEP || 0);
const KINOPOISK_SLEEP = parseInt(process.env.RUTOR_SLEEP || 0);
const PROXY = process.env.PROXY || '';
const BASICAUTH = process.env.BASICAUTH || '';


function assert(condition, msg) {
	if (!condition) {
		//console.error.call(null, ...log);
		//process.exit(1);
		throw new Error(msg);
	}
	return condition;
}


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

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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

		if (PROXY) {
			// options.agent = new ProxyAgent(PROXY);
		}

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

	if (PROXY) {
		// options.agent = new ProxyAgent(PROXY);
	}

	let data, status;

	try{
		[data, status] = await doRequest(options); //.then(([str, status])=>{console.log(JSON.parse(str), status)});
		if (status != 200) {
			console.error("Can't read", requestMethod);
			console.error(data);
			process.exit(1);
		}
		data = JSON.parse(data);

		const result = {};
		assert(data['resultCode'] == 0, 
			`Can\'t read json. resultCode: ${data['resultCode']} message: ${data['message'] || ''}`);
		assert(data['data'] && typeof data['data'] === 'object', 
			'Can\'t read json. Empty data field or not object');

		result['nameRU'] = assert(data['data']['nameRU'], 'Validate data error. Empty nameRU field');
		result['nameEN'] = data['data']['nameEN'] || '';
		result['year'] = assert(data['data']['year'], 'Validate data error. Empty year field');
		result['country'] = assert(data['data']['country'], 'Validate data error. Empty country field');
		result['genre'] = assert(data['data']['genre'], 'Validate data error. Empty genre field');
		result['description'] = assert(data['data']['description'], 'Validate data error. Empty description field');
		result['ratingAgeLimits'] = data['data']['ratingAgeLimits'] || '-';
		result['posterURL'] = "https://st.kp.yandex.net/images/" + assert(data['data']['bigPosterURL'], 'Validate data error. Empty bigPosterURL field');
		result['filmLength'] = assert(data['data']['filmLength'], 'Validate data error. Empty filmLength field');
		assert(typeof data['data']['ratingData'] === 'object', 'Validate data error. Empty ratingData field');
		result['rating'] = assert(data['data']['ratingData']['rating'], 'Validate data error. Empty rating field');
		result['ratingIMDb'] = data['data']['ratingData']['ratingIMDb'] || 0;
		result['webURL'] = assert(data['data']['webURL'], 'Validate data error. Empty webURL field');
		assert(Array.isArray(data['data']['creators']), 'Validate data error. Empty creators field');
		result['directors'] = [];
		result['actors'] = [];
		
		for(const personsGroup of data['data']['creators']) {
			assert(Array.isArray(personsGroup), 'Validate data error. Empty creators field');
			for(const person of personsGroup) {
				assert(typeof person === 'object', 'Validate data error. Empty creators > person field');
				const prof = person['professionKey'] || 'actor';
				const name = person['nameRU'] || person['nameEN'];
				if (!name) continue;
				switch(prof) {
					case 'director': {
						result['directors'].push(name);
					} break;
					case 'actor': {
						result['actors'].push(name);
					} break;
				}
			}
		}

		result['ratingFloat'] = ((parseFloat(result['ratingIMDb']) + parseFloat(result['rating'])) / 2 + 0.001).toPrecision(1);

		const [day, month, year] = assert(data['data']['rentData']['premiereDigital'], 'Validate data error. Empty nameRU field').split('.').map(p=>parseInt(p));
		result['pubDate'] = new Date(year, month-1, day, (new Date()).getTimezoneOffset() / 60 * -1);

		KINOPOISK_SLEEP && await sleep(KINOPOISK_SLEEP);

		return result;
	}
	catch (e) {
		console.dir(data['data'], {depth: null});
		console.error("Can't read", requestMethod);
		console.error(e);
		// process.exit(1);
		return null;
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

	if (PROXY) {
		options.agent = new ProxyAgent(PROXY);
	}

	try{
		[data, status] = await doRequest(options); //.then(([str, status])=>{console.log(JSON.parse(str), status)});
		if (status != 200) {
			console.error("Can't read rutor", filmId);
			console.error(data);
			process.exit(1);
		}
		// data = JSON.parse(data);
		// TODO check fields
		// return data;
	}
	catch (e) {
		console.error("Can't read rutor", filmId);
		console.error(e);
		//process.exit(1);
		return false;
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

	RUTOR_SLEEP && await sleep(RUTOR_SLEEP);

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
		for(const torrent of movie.torrents) {
			rss += `<item>
			<pubDate>${movie.pubDate.toGMTString()}</pubDate>
				<title>
					<![CDATA[${movie.nameRU} (${movie.genre}) (${torrent.type})]]>
				</title>
				<guid>${movie.webURL}#${movie.pubDate.getTime()}-${torrent.type.replace(' ', '_')}</guid>
				<link>${torrent.link}</link>
				<author>kinopoisk</author>
				<description>
					<![CDATA[
						<div style="font-size: 26pt; margin-bottom: 10px;">${movie.nameRU} (${movie.nameEN}) (${movie.year})</div>
						<img src="${movie.posterURL}" alt="lostfilm.tv" style="margin-right: 15px; display: inline-block;" width=250px/>
						<div style="display: inline-block; width: 50%; vertical-align: top; font-size: medium;">
							<div class="date">${dateFormat(movie.pubDate, '%d.%m.%Y')}</div>
							<div class="desc">${movie.description}</div>
						</div>
					]]>
				</description>
			</item>`;
		}
	}

	rss += '</channel></rss>';

	if (!fs.existsSync(SAVE_PATH)) {
		fs.mkdirSync(SAVE_PATH, {recursive: true});
	}

	fs.writeFileSync(path.join(SAVE_PATH, 'info.rss'), rss);
}


async function saveHTML(movies) {
	let html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
	<html xmlns="http://www.w3.org/1999/xhtml" lang="ru-RU">
	<head>
	<meta charset="utf-8">
	<meta content="width=960" name="viewport">
	<title>Новые цифровые релизы</title>
	<style type="text/css">
		html {
			background-color: #e6e6e6;
			min-width: 1024px;
			width: 100%;
			position: relative;
		}
	
		body {
			background: #e6e6e6;
			color: #333;
			font-family: tahoma,verdana,arial;
			margin: 0;
			padding: 0 0 22px 0;
		}
		
		* {
			outline: 0;
		}
		
		.shadow {
			box-shadow: 0px 10px 20px 0px rgba(0, 0, 0, 0.2);
			width: 850px;
			margin: 0 auto;
			position: relative;
			z-index: 1;
		}
		
		.block1 {
			width: 850px;
			position: relative;
			margin: 0 auto;
		}
		
		.block2 {
			position: relative;
			background-color: #f2f2f2;
			width: 100%;
		}
		
		.block2::before, .block2::after {
			content: "";
			display: table;
		}
		
		.block2::after, .photoInfoTable::after {
			clear: both;
		}
		
		.photoInfoTable::before, .photoInfoTable::after {
			content: "";
			display: table;
		}
		
		.photoInfoTable {
			width: 850px;
			float: left;
		}
		
		.headerFilm h1 {
			margin: 0;
			padding: 0;
		}
		
		.headerFilm {
			width: 620px;
			padding: 20px 20px 20px 15px;
			position: relative;
		}
		
		
		H1.moviename {
			vertical-align: middle;
			padding-left: 0px;
			margin: 5px 0;
			font-size: 25px;
			font-weight: normal;
		}
		
		H1 {
			font-size: 25px;
			font-weight: normal;
			color: #000;
		}
		
		.headerFilm > span {
			color: #666;
			font-size: 13px;
		}
		
		.film-img-box {
			margin-left: 0;
			position: relative;
			left: -12px;
			min-height: 205px;
			margin-bottom: 15px;
		}
		
		.film-img-box img {
			border: 0;
		}
		
		.photoBlock {
			width: 210px;
			padding: 0 0 0 0;
			float: left;
			position: relative;
			font-size: 11px;
		}
		
		.movie-buttons-container {
			margin-bottom: 20px;
		}
		
		.torrentbutton {
			cursor: pointer;
			border: none;
			-webkit-appearance: none;
			-moz-appearance: none;
			appearance: none;
			background-color: #f60;
			border-radius: 3px;
			color: #fff;
			display: block;
			font: 12px Arial, sans-serif;
			font-weight: normal;
			line-height: normal;
			font-weight: bold;
			height: 35px;
			line-height: 36px;
			-webkit-transition: background-color 0.1s, color 0.1s, border-color 0.1s;
			-moz-transition: background-color 0.1s, color 0.1s, border-color 0.1s;
			transition: background-color 0.1s, color 0.1s, border-color 0.1s;
			text-align: center;
			text-decoration: none;
			width: 160px;
			margin: 10px 0 10px 15px;
			display:inline-block;
		}
		
		.infoTable {
			float: left;
			display: block;
		}
		
		.infoTable .info {
			width: 465px;
		}
		
		.info, .info * {
			border-collapse: collapse;
			margin: 0;
			padding: 0;
		}
		
		.info tr {
			border-bottom: #DFDFDF solid 1px; 
		}
		
		.info .type {
			color: #f60;
			width: 119px;
			padding-left: 23px;
		}
		
		.info td {
			min-height: 14px;
			vertical-align: top;
			padding-bottom: 9px;
			padding: 6px 0 6px 20px;
		}
		
		td {
			font-family: tahoma,verdana,arial;
			font-size: 11px;
			color: #000;
		}
		
		.film-rating {
			border-radius: 1px;
			position: absolute;
			left: 5px;
			top: 5px;
			z-index: 5;
			box-shadow: none;
			color: #fff;
			width: 32px;
			font-size: 11px;
			font-weight: 600;
			line-height: 13px;
			padding: 3px 0 2px;
			text-align: center;
			font-family: Arial,Tahoma,Verdana,sans-serif;
		}
	</style>
	</head>
	<body>
		<div class="shadow">
			<div class="block1" style="background-color: #f2f2f2;">`;

	const descriptionTemplate = `
	<tr>
		<td class="type">%s</td>
		<td>
			<div style="position: relative">
				%s
			</div>
		</td>
	</tr>`

	for(const movie of movies) {
		let descriptionBlock = [];
		let buttonsBlock = [];
		descriptionBlock.push(util.format(descriptionTemplate, "год", movie["year"]));
		descriptionBlock.push(util.format(descriptionTemplate, "Дата релиза", dateFormat(movie["pubDate"], '%d.%m.%Y')));
		descriptionBlock.push(util.format(descriptionTemplate, "страна", movie["country"]));
		descriptionBlock.push(util.format(descriptionTemplate, "режиссёр", movie["directors"]));
		descriptionBlock.push(util.format(descriptionTemplate, "актёры", movie["actors"]));
		descriptionBlock.push(util.format(descriptionTemplate, "жанр", movie["genre"]));
		if (movie["ratingAgeLimits"] > 0) {
			descriptionBlock.push(util.format(descriptionTemplate, "возраст", movie["ratingAgeLimits"]));
		}
		descriptionBlock.push(util.format(descriptionTemplate, "продолжительность", movie["filmLength"]));
		descriptionBlock.push(util.format(descriptionTemplate, "рейтинг КиноПоиск", movie["rating"]));
		descriptionBlock.push(util.format(descriptionTemplate, "рейтинг IMDb", movie["ratingIMDb"]));
		descriptionBlock.push(util.format(descriptionTemplate, "описание", movie["description"]));

		for(const torrent of movie.torrents) {
			buttonsBlock.push(`<button class="torrentbutton" style="" onclick="location.href='${torrent['link']}'" title="${torrent['name']}">${torrent['type']}</button>`)
		}

		let ratingColor = movie["ratingFloat"] >= 7 ? "#3bb33b" : "#aaa";

		html += `<div class="block2">
		<div class="photoInfoTable">
		<div class="headerFilm">
			<h1 class="moviename" itemprop="name">${movie["nameRU"]}</h1>
			<span itemprop="alternativeHeadline" style="${movie["nameEN"] ? '' : 'display: none;'}">${movie["nameEN"]}</span>
		</div>
		<div class="photoBlock">
			<div class="film-img-box">
			<div class="film-rating" style="background-color: ${ratingColor};">${movie["ratingFloat"]}</div>
			<img src="${movie["posterURL"]}" alt="${movie["nameRU"]}" itemprop="image" width="205"></img>
			</div>
		</div>
		<div class="infoTable">
			<table class="info">
				<tbody>
					${descriptionBlock.join("\n")}
				</tbody>
			</table>
		</div>
		</div>
		<div class="movie-buttons-container">
			${buttonsBlock.join("\n")}
		</div>
	</div>`;
	}

	html += `</div></div></body></html>`;

	if (!fs.existsSync(SAVE_PATH)) {
		fs.mkdirSync(SAVE_PATH, {recursive: true});
	}

	fs.writeFileSync(path.join(SAVE_PATH, 'info.html'), html);

}

async function getFilmWithLinks(filmId) {
	const torrents = await rutorLinks(filmId)
	if (!Array.isArray(torrents) || torrents.length == 0) return null;

	const detail = await filmDetail(filmId);
	if (!detail) return null;
	detail["torrents"] = torrents;

	return detail;
}

async function build() {
	const releases = await digitalReleases();
	let movies = [];

	for(const filmId of releases) {
		const detail = await getFilmWithLinks(filmId);
		if (!detail) continue;
		movies.push(detail);
	}

	// super fast but rutor block
	// let wait = [];
	// for(const filmId of releases) 
	// 	wait.push(getFilmWithLinks(filmId));
	// movies = await Promise.all(wait);

	// sort by release date
	movies = movies.filter(m=>m!==null).sort((a,b)=>(b.pubDate.getTime() - a.pubDate.getTime()))

	console.log('Movies:', movies.map(m=>`${m.nameRU}(${m.torrents.length})`));
	console.log('Movies count:', movies.length);

	saveRSS(movies);
	saveHTML(movies);
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
		console.log('requested', request.url, 'from', request.connection.remoteAddress);

		if (BASICAUTH) {
			let userpass = Buffer.from((request.headers.authorization || '').split(' ')[1] || '', 'base64').toString();
			if (userpass !== BASICAUTH) {
				response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="nope"' });
				response.end('HTTP Error 401 Unauthorized: Access is denied');
				console.error('unauthorized access', request.url, 'user', userpass);
				return;
			}
		}
	
		let filePath = ('.' + request.url).replace('..', '.');
	
		switch (filePath) {
			case './html': 
			case './html/': {
				filePath = './info.html';
			} break;
			case './rss':
			case './rss/': {
				filePath = './info.rss';
			} break;
			// default: {
			// 	response.writeHead(404);
			// 	response.end('', 'utf-8');
			// } break;
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
			case '.ico':
				contentType = 'image/x-icon';
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
	
	
	})
	// .on('connection', function(sock) {
	// 	console.log('Client connected from ' + sock.remoteAddress);
	// })
	.listen(PORT);
	console.log('Web server started at', PORT);
}