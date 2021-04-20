const express = require('express');
const router = express.Router();
const axios = require('axios');

let cacheTickers = {};

async function getPricePaprika(ticker) {
    let data = await axios.get('https://api.coinpaprika.com/v1/tickers/' + ticker + '?quotes=rub,eur,usd,cny');
    return data.data
}

router.get('/market-price/:ticker', async function (req, res, next) {
    let dt = Math.floor(Date.now() / 1000) - 60;

    if (!cacheTickers[req.params["ticker"]]) {
        cacheTickers[req.params["ticker"]]= {};
        cacheTickers[req.params["ticker"]].timestamp = 0

    }

    if (cacheTickers[req.params["ticker"]].timestamp < dt) {
        cacheTickers[req.params["ticker"]] = {
            timestamp: Math.floor(Date.now() / 1000),
            data: await getPricePaprika(req.params["ticker"])
        }
    } else {
        //console.log('cache', req.params["ticker"])
    }

    await res.json(cacheTickers[req.params["ticker"]].data)

});

module.exports = router;
