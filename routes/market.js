const express = require('express');
const router = express.Router();
const axios = require('axios');

let cacheTickers = {};

async function getPricePaprika(ticker) {
    let data = await axios.get('https://api.coinpaprika.com/v1/tickers/' + ticker + '?quotes=rub,eur,usd,cny');
    return data.data
}

async function getPriceBinance(ticker) {
    let data = await axios.get('https://api.binance.com/api/v1/ticker/price?symbol=' + ticker); // BTSUSDT
    return data.data
}

async function getPriceXbts(ticker) {
    let data = await axios.get('https://cmc.xbts.io/v2/tickers/' + ticker); // STH_BTS
    return data.data
}

async function getTickersXbts() {
    const data = await axios.get('https://cmc.xbts.io/v2/tickers'); // all tickers
    return data.data
}

let cacheXbtsPrices = {}
router.get('/xbts-prices', async function (req, res, next) {
    let dt = Math.floor(Date.now() / 1000) - 60 * 8;
    if (!cacheXbtsPrices.timestamp) {
        cacheXbtsPrices = {
            timestamp: 0,
            ticker: {}
        };
    }
    if (dt > cacheXbtsPrices.timestamp) {
        cacheXbtsPrices.timestamp = Math.floor(Date.now() / 1000);
        cacheXbtsPrices.ticker = (await getTickersXbts()).ticker;
    }
    await res.json(cacheXbtsPrices)
});

router.get('/price/:ticker', async function (req, res, next) {
    /*
    let dt = Math.floor(Date.now() / 1000) - 60 * 12;

    if (!cacheTickers[req.params["ticker"]]) {
        cacheTickers[req.params["ticker"]]= {};
        cacheTickers[req.params["ticker"]].timestamp = 0

    }

    if (dt > cacheTickers[req.params["ticker"]].timestamp) {
        cacheTickers[req.params["ticker"]] = {
            timestamp: Math.floor(Date.now() / 1000),
            data: await getPricePaprika(req.params["ticker"])
        }
    } else {
        //console.log('cache', req.params["ticker"])
    }

    await res.json(cacheTickers[req.params["ticker"]].data)

     */
    res.json(null);
});

module.exports = router;
