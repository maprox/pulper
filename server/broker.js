var config = require('./config.js');
var amqp = require('amqplib');
var when = require('when');

/**
 * Returns exchange name
 *
 * @returns {String}
 */
var getExchangeName = function() {
    return config.amqp.exchange;
};

/**
 * Returns exchange promise
 *
 * @param channel
 * @returns {Object}
 */
var getExchange = function(channel) {
    var exchangeName = getExchangeName();
    return channel.assertExchange(
        exchangeName, 'topic', { durable: true }
    )
};

module.exports = {
    /**
     * Sends data to ServiceB
     *
     * @param {Object} message
     */
    process: function(message) {
        console.log(" [-] Connecting to %s", config.amqp.connection);
        amqp.connect(config.amqp.connection).then(function(conn) {
            return when(conn.createChannel().then(function(channel) {
                console.log(" [+] Connected");
                console.log(' [+] Preparing to send %s', message.uuid);
                return getExchange(channel).then(function() {
                    var now = new Date();
                    channel.publish(
                        getExchangeName(),
                        message.routingKey,
                        new Buffer(JSON.stringify(message.payload)),
                        {
                            contentType: 'application/json',
                            correlationId: message.uuid,
                            timestamp: now.getTime(),
                            headers: {
                                "date-iso": now.toISOString()
                            }
                        }
                    );
                    console.log(" [>] Sent %s to %s",
                        message.uuid, message.routingKey);
                    return channel.close();
                });
            })).ensure(function() { conn.close(); });
        }, function(err) {
            console.error(' [!] Connect failed: %s', err);
        }).then(null, function(err) {
            console.error(' [!] Connect succeeded, but error thrown: %s', err);
        });
    },

    /**
     * Waiting for data
     *
     * @param {String} queuePrefix
     * @param {Function} callback
     */
    receive: function(queuePrefix, callback) {
        console.log(" [-] Connecting to %s", config.amqp.connection);
        amqp.connect(config.amqp.connection).then(function(conn) {
            return conn.createChannel().then(function(channel) {
                console.log(" [+] Connected");
                return getExchange(channel)
                    .then(function() {
                        return channel.assertQueue(
                            queuePrefix + '.all',
                            {durable: true}
                        );
                    })
                    .then(function(qok) {
                        var queue = qok.queue;
                        return channel.bindQueue(
                            queue, getExchangeName(), queuePrefix + '.#'
                        ).then(function() {
                            return queue;
                        });
                    })
                    .then(function(queue) {
                        console.log(' [+] Waiting for data...');
                        return channel.consume(queue, function(message) {
                            var data = JSON.parse(message.content.toString());
                            callback(data, message, channel);
                        });
                    });
            });
        }, function(err) {
            console.error(' [!] Connect failed: %s', err);
        }).then(null, function(err) {
            console.error(' [!] Connect succeeded, but error thrown: %s', err);
        });
    }

};