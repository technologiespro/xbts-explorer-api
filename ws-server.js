const WebSocket = require('ws');
const emitter = require('./emitter');
const jsonFile = require('jsonfile');
const port = jsonFile.readFileSync('./config.json').ws;

let clients = [];
let eventsInit = false;

function noop() {
}

function heartbeat() {
    this.isAlive = true;
}


function wsStart() {
    console.log('api ws start on ', port);
    const wss = new WebSocket.Server({
        port: port,
        perMessageDeflate: {
            zlibDeflateOptions: {
                // See zlib defaults.
                chunkSize: 1024,
                memLevel: 7,
                level: 3
            },
            zlibInflateOptions: {
                chunkSize: 10 * 1024
            },
            // Other options settable:
            clientNoContextTakeover: true, // Defaults to negotiated value.
            serverNoContextTakeover: true, // Defaults to negotiated value.
            serverMaxWindowBits: 10, // Defaults to negotiated value.
            // Below options specified as default values.
            concurrencyLimit: 10, // Limits zlib concurrency for perf.
            threshold: 1024 // Size (in bytes) below which messages
            // should not be compressed.
        }
    });


    wss.on('connection', (ws) => {
        console.log('ws connect');
        ws.isAlive = true;
        ws.on('pong', heartbeat);
        //console.log(req.url)

        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        //connection is up, let's add a simple simple event
        ws.on('message', (message) => {

            let msg = JSON.parse(message);
            //console.log('msg', msg);

            //console.log('msg.userId', msg.userId)

            if (msg.userId) {
                ws.id = msg.userId;
                clients[msg.userId] = ws;
            }


            if (msg.op === 'get-data') {
                emitter.eventBus.sendEvent('get-data', msg)
            }

            //send immediatly a feedback to the incoming connection
            //ws.send(JSON.stringify({"op": "welcome", "userId": msg.userId}))

        });


        /** EVENTS **/

        if (!eventsInit) {

            emitter.eventBus.on('data:response', function (data) {
                data.clients = wss.clients.size;
                wss.clients
                    .forEach(client => {
                        client.send(JSON.stringify(data))
                    })
            });

            /** ********************* **/

            eventsInit = true
        }
    });

    const interval = setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            if (ws.isAlive === false) return ws.terminate();

            ws.isAlive = false;
            ws.ping(noop);
        });
    }, 30000);

    // userId disconnected
    wss.on('close', function (connection) {
        console.log('connection close', connection)
        clearInterval(interval);
    });


}

exports.start = wsStart()
