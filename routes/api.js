const express = require('express');
const router = express.Router();
const BitShares = require('btsdex');
const jsonFile = require('jsonfile');
const CONFIG = jsonFile.readFileSync('./config.json');
const emitter = require('../emitter');
const ChainTypes = require('bitsharesjs/dist/chain/src/ChainTypes.js');

const opKeys = Object.keys(ChainTypes.operations);
let operations = [];
for (let i=0; i < opKeys.length; i++) {
    operations[ChainTypes.operations[opKeys[i]]] = opKeys[i];
}

//console.log(operations)

BitShares.connect(CONFIG.node);
BitShares.subscribe('connected', startAfterConnected);
BitShares.subscribe('block', callEachBlock);

let globalProperties = null;
let dynamicProperties = null;

async function startAfterConnected() {
    globalProperties = await BitShares.db.get_global_properties();
}

async function callEachBlock(obj) {
    //console.log(obj[0])
    const witness = await BitShares.db.get_objects([obj[0].current_witness]);
    const witnessAccount = await BitShares.db.get_objects([witness[0].witness_account]);
    const txs = (await BitShares.db.get_block(obj[0].head_block_number)).transactions;
    //console.log('witnessAccount', witnessAccount[0].name);

    let records = [];
    for (let i=0; i < txs.length; i++) {
        for (let j=0; j < txs[i].operations.length; j++) {
            //{ "fee": { "amount": 482, "asset_id": "1.3.0" }, "fee_paying_account": "1.2.33015", "order": "1.7.455419963", "extensions": [] }
            const opType = operations[txs[i].operations[j][0]];
            const op = txs[i].operations[j][1];
            let opAccount = null;
            if (opType === 'limit_order_cancel') {
                opAccount = (await BitShares.db.get_objects([op.fee_paying_account]))[0];
            }

            if (opType === 'limit_order_create') {
                opAccount = (await BitShares.db.get_objects([op.seller]))[0];
            }

            if (opType === 'asset_publish_feed') {
                opAccount = (await BitShares.db.get_objects([op.publisher]))[0];
                //console.log(op)
            }




            //console.log(txs)

            records.unshift({
                opId: txs[i].operations[j][0],
                type: opType,
                op: op,
                account: opAccount,
                block: obj[0].head_block_number
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
        },
    });

    //console.log(result)
}

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


module.exports = router;
