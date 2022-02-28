const express = require('express');
const router = express.Router();
const BitShares = require('btsdex');
const jsonFile = require('jsonfile');
const CONFIG = jsonFile.readFileSync('./config.json');
const emitter = require('../emitter');
const ChainTypes = require('bitsharesjs/dist/chain/src/ChainTypes.js');
const axios = require('axios');
const scheduler = require("node-schedule");

const opKeys = Object.keys(ChainTypes.operations);
let operations = [];
for (let i = 0; i < opKeys.length; i++) {
    operations[ChainTypes.operations[opKeys[i]]] = opKeys[i];
}

let tickers = [];

//console.log(operations)

BitShares.connect(CONFIG.node);
BitShares.subscribe('connected', startAfterConnected);
BitShares.subscribe('block', callEachBlock);

let globalProperties = null;

async function startAfterConnected() {
    globalProperties = await BitShares.db.get_global_properties();
}

async function getTickers() {
    try {
        tickers = (await axios.get('https://cmc.xbts.io/v2/tickers')).data.ticker;
    } catch (e) {
        console.log('err getTickers()')
    }
    return tickers;
}

async function init() {
    await getTickers();
}

init().then();

scheduler.scheduleJob("1 */10 * * * *", async () => {
    await getTickers();
});


async function callEachBlock(obj) {
    //console.log(obj[0])
    const witness = await BitShares.db.get_objects([obj[0].current_witness]);
    const witnessAccount = await BitShares.db.get_objects([witness[0].witness_account]);
    const txs = (await BitShares.db.get_block(obj[0].head_block_number)).transactions;
    //console.log('witnessAccount', witnessAccount[0].name);

    let records = [];
    let feesBlock = 0;
    for (let i = 0; i < txs.length; i++) {
        for (let j = 0; j < txs[i].operations.length; j++) {
            //{ "fee": { "amount": 482, "asset_id": "1.3.0" }, "fee_paying_account": "1.2.33015", "order": "1.7.455419963", "extensions": [] }
            const opType = operations[txs[i].operations[j][0]];
            const op = txs[i].operations[j][1];
            //console.log(op)
            let opAccount = null;
            let ext = null;
            if (opType === 'limit_order_cancel') {
                opAccount = (await BitShares.db.get_objects([op.fee_paying_account]))[0];
            }

            if (opType === 'limit_order_create') {
                //console.log(op)
                opAccount = (await BitShares.db.get_objects([op.seller]))[0];
                let assetSell = (await BitShares.db.get_objects([op.amount_to_sell.asset_id]))[0];
                let assetReceive = (await BitShares.db.get_objects([op.min_to_receive.asset_id]))[0]

                ext = {
                    from: opAccount.name,
                    sell: {
                        s: assetSell.symbol,
                        amount: op.amount_to_sell.amount / 10 ** assetSell.precision,
                        p: assetSell.precision
                    },
                    receive: {
                        s: assetReceive.symbol,
                        amount: op.min_to_receive.amount / 10 ** assetReceive.precision,
                        p: assetReceive.precision
                    },
                    price: ((op.min_to_receive.amount / 10 ** assetReceive.precision) / (op.amount_to_sell.amount / 10 ** assetSell.precision)).toFixed(assetSell.precision)

                }
                //console.log('ext', ext)
            }

            if (opType === 'asset_publish_feed') {
                opAccount = (await BitShares.db.get_objects([op.publisher]))[0];
            }

            if (opType === 'transfer') {
                let asset = (await BitShares.db.get_objects([op.amount.asset_id]))[0]
                try {
                    ext = {
                        from: (await BitShares.db.get_objects([op.from]))[0],
                        to: (await BitShares.db.get_objects([op.to]))[0],
                        asset: {
                            s: asset.symbol,
                            p: asset.precision
                        },
                        amount: op.amount.amount / 10 ** asset.precision,
                    }
                } catch (e) {
                    console.log('err', e)
                }
                //console.log(op)
            }

            //console.log(txs)

            let fee = null;
            if (op.fee) {
                //console.log(op.fee)
                let feeAsset = (await BitShares.db.get_objects([op.fee.asset_id]))[0]
                let amountFee = op.fee.amount / (10 ** feeAsset.precision);
                fee = {
                    asset: feeAsset.symbol,
                    amount: amountFee.toFixed(feeAsset.precision)
                };
                if (feeAsset.symbol === 'BTS') {
                    feesBlock = feesBlock + amountFee;
                }
                //console.log(feeAsset)
            }

            records.unshift({
                opId: txs[i].operations[j][0],
                type: opType,
                op: op,
                account: opAccount,
                block: obj[0].head_block_number,
                ext: ext,
                fee: fee,

            })
        }
    }


    emitter.eventBus.sendEvent('block:response', {
        op: 'block:response',
        data: {
            witness: witnessAccount[0].name,
            block: obj[0],
            records: records,
            txs: txs,
            fees: feesBlock.toFixed(5),
        },
    });

    //console.log(result)
}

router.get('/tickers', async function (req, res, next) {
    await res.json(tickers);
});

router.get('/global-properties', async function (req, res, next) {
    await res.json(globalProperties);
});

router.get('/dynamic-properties', async function (req, res, next) {
    await res.json(await BitShares.db.get_dynamic_global_properties());
});

router.get('/config', async function (req, res, next) {
    await res.json(await BitShares.db.get_config());
});

router.get('/chain', async function (req, res, next) {
    await res.json(await BitShares.db.get_chain_properties());
});

router.get('/get-account/:account', async function (req, res, next) {
    const account = await BitShares.accounts[req.params.account];
    const ops = await BitShares.history.get_account_history(account.id, "1.11.0", 10, "1.11.0");
    await res.json({
        account: account,
        history: ops
    });
});

router.get('/ticker/:s1/:s2', async function (req, res, next) {
    await res.json(await BitShares.ticker(req.params['s1'], req.params['s2']))
});

router.get('/get-asset', async function (req, res, next) {
    await res.json(await BitShares.db.list_assets("XBTSX", 100))
});

router.post('/assets', async function (req, res, next) {
    await res.json(await BitShares.db.get_assets(req.body.assets))
});

router.get('/asset-name/:asset', async function (req, res, next) {
    let data = await BitShares.assets[req.params['asset']]

    try {
        data.options.description = JSON.parse(data.options.description);
        data.options.description.main = data.options.description.main.replace(/[\r\n]+/gm, "");
    } catch (e) {

    }

    await res.json(data);
});

router.get('/asset-id/:id', async function (req, res, next) {
    await res.json(await BitShares.assets.id(req.params['id']));
});

router.get('/asset-holders/:asset', async function (req, res, next) {
    //const assetId = (await BitShares.assets[req.params['asset']]).id;
    //const holders = await BitShares.holdersCount(req.params['asset'])
    await res.json();
    //await res.json(holders)
});

router.get('/block/:height', async function (req, res, next) {
    const block = await BitShares.db.get_block(req.params['height']);
    const witness = (await BitShares.db.get_objects([block.witness]))[0];
    const user = (await BitShares.db.get_objects([witness.witness_account]))[0];
    let txs = [];
    for (let i = 0; i < block.transactions.length; i++) {
        console.log(block.transactions[i].operations[0][1]);
        let account = null;
        if (block.transactions[i].operations[0][1].fee_paying_account) {
            account = (await BitShares.db.get_objects([block.transactions[i].operations[0][1].fee_paying_account]))[0]
        }

        if (block.transactions[i].operations[0][1].publisher) {
            account = (await BitShares.db.get_objects([block.transactions[i].operations[0][1].publisher]))[0]
        }

        if (block.transactions[i].operations[0][1].seller) {
            account = (await BitShares.db.get_objects([block.transactions[i].operations[0][1].seller]))[0]
        }

        txs.push({
            order: block.transactions[i].operations[0][1].order,
            op: operations[block.transactions[i].operations[0][0]],
            account: account
        });
    }
    await res.json({
        raw: block,
        data: {
            witness: witness,
            user: user,
            txs: txs
        }
    });
});

router.get('/holders/:symbol/:from/:to', async function (req, res, next) {
    await res.json(await BitShares.holders(req.params['symbol'], req.params['from'], req.params['to']));
});

router.get('/object/:id', async function (req, res, next) {
    let result = null;
    try {
        result = await BitShares.db.get_objects([req.params['id']])
    } catch (e) {
        result = e;
    }

    await res.json(result);
});

/** FOR UI **/
router.post('/objects', async function (req, res, next) {
    let result = null;
    try {
        result = await BitShares.db.get_objects(req.body.objects)
    } catch (e) {
        result = e;
    }
    await res.json(result);
});

router.get('/lp-history/:id', async function (req, res, next) {
    let result = null;
    try {
        result = await BitShares.history.get_liquidity_pool_history(req.params['id'])
    } catch (e) {
        result = e;
    }
    await res.json(result);
});

router.post('/lp-history', async function (req, res, next) {
    let result = null;
    try {
        result = await BitShares.history.get_liquidity_pool_history(req.body.id, null, null, req.body.limit || 10, req.body.op)
    } catch (e) {
        result = e;
    }
    await res.json(result);
});

router.post('/accounts', async function (req, res, next) {
    let result = null;
    try {
        result = await BitShares.db.get_full_accounts(req.body['ids'], false)
    } catch (e) {
        result = e;
    }
    await res.json(result);
});


router.get('/lp-apy/:id', async function (req, res, next) {
    await res.json(await BitShares.db.list_liquidity_pools(1, req.params['id'], true))
});

router.get('/lp-list/:from', async function (req, res, next) {
    await res.json(await BitShares.db.list_liquidity_pools(100, req.params['from'], true))
});

router.get('/lps-a/:asset', async function (req, res, next) {
    //await BitShares.db.get_objects([obj[0].current_witness]);
    let pools = await BitShares.db.get_liquidity_pools_by_asset_a(req.params['asset'], null, null)
    if (pools.length) {
        const a = await BitShares.db.get_objects([pools[0].asset_a]);
        let ids = [];
        for (let i = 0; i < pools.length; i++) {
            pools[i].a = {
                symbol: a[0].symbol,
                precision: a[0].precision,
            };
            ids.push(pools[i].asset_b);
        }
        const b = await BitShares.db.get_objects(ids);
        for (let i = 0; i < pools.length; i++) {
            pools[i].b = {
                symbol: b[i].symbol,
                precision: b[i].precision,
            };
        }
    }
    await res.json(pools);
});

router.get('/lps-b/:asset', async function (req, res, next) {
    let pools = await BitShares.db.get_liquidity_pools_by_asset_b(req.params['asset'], null, null);
    if (pools.length) {
        const b = await BitShares.db.get_objects([pools[1].asset_b]);
        let ids = [];
        for (let i = 0; i < pools.length; i++) {
            pools[i].b = {
                symbol: b[0].symbol,
                precision: b[0].precision,
            };
            ids.push(pools[i].asset_a);
        }
        const a = await BitShares.db.get_objects(ids);
        for (let i = 0; i < pools.length; i++) {
            pools[i].a = {
                symbol: a[i].symbol,
                precision: a[i].precision,
            };
        }
    }
    await res.json(pools);
});

router.get('/lps-ab/:a/:b', async function (req, res, next) {
    await res.json(await BitShares.db.get_liquidity_pools_by_both_assets(req.params['a'], req.params['b'], null, null));
});


async function calcTotalAmount(symbol, balance) {
    let amount = {
        amount: 0,
        price: 0,
    };
    if (tickers['BTS_' + symbol.replace('XBTSX.', '')]) {
        amount.amount = tickers['BTS_' + symbol.replace('XBTSX.', '')].last * balance;
        amount.price = tickers['BTS_' + symbol.replace('XBTSX.', '')].last;
    }
    return amount;
}


router.get('/lps/:a', async function (req, res, next) {
    let pools = await BitShares.db.get_liquidity_pools_by_one_asset(req.params['a'], 101, null, true);
    //console.log(pools)
    let result = [];
    /*
    let shareIds = []
    for (let i = 0; i < pools.length; i++) {
        shareIds.push(pools[i].share_asset);
    }
    let stats = await BitShares.db.get_liquidity_pools_by_share_asset(shareIds, null, true);
    */

    for (let i = 0; i < pools.length; i++) {
        if (!CONFIG.exclude[pools[i].id]) {
            const shareDynId = pools[i].share_asset.replace("1.3.", "2.3.");
            const poolAssets = await BitShares.db.get_objects([pools[i].asset_a, pools[i].asset_b, pools[i].share_asset, shareDynId]);
            let shareDesc = {
                main: "",
                short_name: poolAssets[0].symbol + '/' + poolAssets[1].symbol + ' Liquidity Pool Token',
            }

            try {
                shareDesc = JSON.parse(poolAssets[2].options.description);
            } catch (e) {

            }


            pools[i].statistics._24h_exchange_a2b_amount_a = pools[i].statistics._24h_exchange_a2b_amount_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_a2b_amount_b = pools[i].statistics._24h_exchange_a2b_amount_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_exchange_b2a_amount_a = pools[i].statistics._24h_exchange_b2a_amount_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_b2a_amount_b = pools[i].statistics._24h_exchange_b2a_amount_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_withdrawal_fee_a = pools[i].statistics._24h_withdrawal_fee_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_withdrawal_fee_b = pools[i].statistics._24h_withdrawal_fee_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_exchange_fee_a = pools[i].statistics._24h_exchange_fee_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_fee_b = pools[i].statistics._24h_exchange_fee_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_deposit_amount_a = pools[i].statistics._24h_deposit_amount_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_deposit_amount_b = pools[i].statistics._24h_deposit_amount_b / 10 ** poolAssets[1].precision;

            const balanceA = (pools[i].balance_a / 10 ** poolAssets[0].precision).toFixed(poolAssets[0].precision);
            const balanceB = (pools[i].balance_b / 10 ** poolAssets[1].precision).toFixed(poolAssets[1].precision);

            const apyFeesExchangePercent = (((pools[i].statistics['_24h_exchange_fee_a'] / balanceA * 100 * 365) + (pools[i].statistics['_24h_exchange_fee_b'] / balanceB * 100 * 365)) / 2);
            const apyFeesWithdrawalPercent = (((pools[i].statistics['_24h_withdrawal_fee_a'] / balanceA * 100 * 365) + (pools[i].statistics['_24h_withdrawal_fee_b'] / balanceB * 100 * 365)) / 2);
            const apy = (apyFeesExchangePercent + apyFeesWithdrawalPercent).toFixed(2) * 1;

            let amount = {
                amount: 0,
                price: 0,
            }

            if (poolAssets[0].symbol === 'BTS') {
                amount.amount = balanceA;
                amount.price = 1;
            } else {
                amount = await calcTotalAmount(poolAssets[0].symbol, balanceA)
            }


            result.push({
                POOL: pools[i],
                //STATS: pools[i].statistics,
                APY: apy,
                A: {
                    balance: balanceA,
                    vol24: (pools[i].statistics._24h_exchange_a2b_amount_a + pools[i].statistics._24h_exchange_b2a_amount_a).toFixed(poolAssets[0].precision),
                    fee24: (pools[i].statistics._24h_withdrawal_fee_a + pools[i].statistics._24h_exchange_fee_a).toFixed(poolAssets[0].precision),
                    asset: {
                        id: poolAssets[0].id,
                        symbol: poolAssets[0].symbol,
                        precision: poolAssets[0].precision,
                        issuer: poolAssets[0].issuer,
                        market_fee_percent: poolAssets[0].options.market_fee_percent / 100,
                        bitAsset: !!poolAssets[0].bitasset_data_id
                    }
                },
                B: {
                    balance: balanceB,
                    vol24: (pools[i].statistics._24h_exchange_a2b_amount_b + pools[i].statistics._24h_exchange_b2a_amount_b).toFixed(poolAssets[1].precision),
                    fee24: (pools[i].statistics._24h_withdrawal_fee_b + pools[i].statistics._24h_exchange_fee_b).toFixed(poolAssets[1].precision),
                    asset: {
                        id: poolAssets[1].id,
                        symbol: poolAssets[1].symbol,
                        precision: poolAssets[1].precision,
                        issuer: poolAssets[1].issuer,
                        market_fee_percent: poolAssets[1].options.market_fee_percent / 100,
                        bitAsset: !!poolAssets[1].bitasset_data_id
                    }
                },
                SHARE: {
                    supply: (poolAssets[3].current_supply / 10 ** poolAssets[2].precision).toFixed(poolAssets[2].precision),
                    amount: amount.amount * 2,
                    price: amount.price,
                    asset: {
                        id: poolAssets[2].id,
                        symbol: poolAssets[2].symbol,
                        precision: poolAssets[2].precision,
                        issuer: poolAssets[2].issuer,
                        market_fee_percent: poolAssets[2].options.market_fee_percent / 100,
                        description: shareDesc,
                    },
                },
            });
        }
    }
    await res.json(result);
});

router.get('/lp-single/:a', async function (req, res, next) {
    let pools = await BitShares.db.get_liquidity_pools_by_share_asset([req.params['a']], null, true);
    let result = [];
    for (let i = 0; i < pools.length; i++) {
        if (!CONFIG.exclude[pools[i].id]) {
            const shareDynId = pools[i].share_asset.replace("1.3.", "2.3.");
            const poolAssets = await BitShares.db.get_objects([pools[i].asset_a, pools[i].asset_b, pools[i].share_asset, shareDynId]);
            let shareDesc = {
                main: "",
                short_name: poolAssets[0].symbol + '/' + poolAssets[1].symbol + ' Liquidity Pool Token',
            }

            try {
                shareDesc = JSON.parse(poolAssets[2].options.description);
            } catch (e) {

            }


            pools[i].statistics._24h_exchange_a2b_amount_a = pools[i].statistics._24h_exchange_a2b_amount_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_a2b_amount_b = pools[i].statistics._24h_exchange_a2b_amount_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_exchange_b2a_amount_a = pools[i].statistics._24h_exchange_b2a_amount_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_b2a_amount_b = pools[i].statistics._24h_exchange_b2a_amount_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_withdrawal_fee_a = pools[i].statistics._24h_withdrawal_fee_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_withdrawal_fee_b = pools[i].statistics._24h_withdrawal_fee_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_exchange_fee_a = pools[i].statistics._24h_exchange_fee_a / 10 ** poolAssets[0].precision;
            pools[i].statistics._24h_exchange_fee_b = pools[i].statistics._24h_exchange_fee_b / 10 ** poolAssets[1].precision;

            pools[i].statistics._24h_deposit_amount_a = pools[i].statistics._24h_deposit_amount_a / (10 ** poolAssets[0].precision);
            pools[i].statistics._24h_deposit_amount_b = pools[i].statistics._24h_deposit_amount_b / (10 ** poolAssets[1].precision);

            pools[i].statistics._24h_withdrawal_amount_a = pools[i].statistics._24h_withdrawal_amount_a / (10 ** poolAssets[0].precision);
            pools[i].statistics._24h_withdrawal_amount_b = pools[i].statistics._24h_withdrawal_amount_b / (10 ** poolAssets[1].precision);

            const balanceA = (pools[i].balance_a / 10 ** poolAssets[0].precision).toFixed(poolAssets[0].precision);
            const balanceB = (pools[i].balance_b / 10 ** poolAssets[1].precision).toFixed(poolAssets[1].precision);

            const apyFeesExchangePercent = (((pools[i].statistics['_24h_exchange_fee_a'] / balanceA * 100 * 365) + (pools[i].statistics['_24h_exchange_fee_b'] / balanceB * 100 * 365)) / 2);
            const apyFeesWithdrawalPercent = (((pools[i].statistics['_24h_withdrawal_fee_a'] / balanceA * 100 * 365) + (pools[i].statistics['_24h_withdrawal_fee_b'] / balanceB * 100 * 365)) / 2);
            const apy = (apyFeesExchangePercent + apyFeesWithdrawalPercent).toFixed(2) * 1;
            let amount = {
                amount: 0,
                price: 0,
            }

            if (poolAssets[0].symbol === 'BTS') {
                amount.amount = balanceA;
                amount.price = 1;
            } else {
                amount = await calcTotalAmount(poolAssets[0].symbol, balanceA)
            }

            result.push({
                POOL: pools[i],
                //STATS: pools[i].statistics,
                APY: apy,
                A: {
                    balance: balanceA,
                    vol24: (pools[i].statistics._24h_exchange_a2b_amount_a + pools[i].statistics._24h_exchange_b2a_amount_a).toFixed(poolAssets[0].precision),
                    fee24: (pools[i].statistics._24h_withdrawal_fee_a + pools[i].statistics._24h_exchange_fee_a).toFixed(poolAssets[0].precision),
                    asset: {
                        id: poolAssets[0].id,
                        symbol: poolAssets[0].symbol,
                        precision: poolAssets[0].precision,
                        issuer: poolAssets[0].issuer,
                        market_fee_percent: poolAssets[0].options.market_fee_percent / 100,
                    }
                },
                B: {
                    balance: balanceB,
                    vol24: (pools[i].statistics._24h_exchange_a2b_amount_b + pools[i].statistics._24h_exchange_b2a_amount_b).toFixed(poolAssets[1].precision),
                    fee24: (pools[i].statistics._24h_withdrawal_fee_b + pools[i].statistics._24h_exchange_fee_b).toFixed(poolAssets[1].precision),
                    asset: {
                        id: poolAssets[1].id,
                        symbol: poolAssets[1].symbol,
                        precision: poolAssets[1].precision,
                        issuer: poolAssets[1].issuer,
                        market_fee_percent: poolAssets[1].options.market_fee_percent / 100,
                    }
                },
                SHARE: {
                    supply: (poolAssets[3].current_supply / 10 ** poolAssets[2].precision).toFixed(poolAssets[2].precision),
                    amount: amount.amount * 2,
                    price: amount.price,
                    asset: {
                        id: poolAssets[2].id,
                        symbol: poolAssets[2].symbol,
                        precision: poolAssets[2].precision,
                        issuer: poolAssets[2].issuer,
                        market_fee_percent: poolAssets[2].options.market_fee_percent / 100,
                        description: shareDesc,
                    },
                },
            });
        }
    }
    await res.json(result[0]);
});


module.exports = router;
