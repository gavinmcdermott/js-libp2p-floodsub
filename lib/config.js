'use strict';

var debug = require('debug');

var log = debug('libp2p:floodsub');
log.err = debug('libp2p:floodsub:error');

module.exports = {
  log: log,
  multicodec: '/floodsub/1.0.0'
};