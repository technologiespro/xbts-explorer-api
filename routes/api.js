const express = require('express');
const router = express.Router();
const BitShares = require('btsdex');
const jsonFile = require('jsonfile');
const CONFIG = jsonFile.readFileSync('./config.json');
const emitter = require('../emitter');

BitShares.connect(CONFIG.node);
BitShares.subscribe('connected', startAfterConnected);
BitShares.subscribe('block', callEachBlock);

async function startAfterConnected() {

}

async function callEachBlock(obj) {
    console.log(obj[0])
    const witness = await BitShares.db.get_objects([obj[0].current_witness]);
    const witnessAccount = await BitShares.db.get_objects([witness[0].witness_account]);
    console.log('witnessAccount', witnessAccount[0].name);

    emitter.eventBus.sendEvent('block:response', {
        op: 'block:response',
        data: {
            block: obj[0],
            tx: (await BitShares.db.get_block(obj[0].head_block_number)).transactions,
            witness: {
                name: witnessAccount[0].name,
                data: witness[0]
            }
        },
    });

    //console.log(result)
}

router.get('/test', async function (req, res, next) {

});


module.exports = router;
