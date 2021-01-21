const util = require('util')
const eventEmitter = require('events').EventEmitter

function Event () {
    eventEmitter.call(this)
}

util.inherits(Event, eventEmitter)

Event.prototype.sendEvent = function(type, data) {
    this.emit(type, data)
}
var eventBus = new Event();
eventBus.setMaxListeners(100)

module.exports = {
    emitter : Event,
    eventBus : eventBus
};
