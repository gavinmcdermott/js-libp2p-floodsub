'use strict';

var config = require('./config');
var log = config.log;
var multicodec = config.multicodec;
var stream = require('stream');
var PassThrough = stream.PassThrough;
var toPull = require('stream-to-pull-stream');
var lp = require('pull-length-prefixed');
var pull = require('pull-stream');

module.exports = function (libp2pNode, peerSet, subscriptions) {
  return function (peerInfo) {
    var idB58Str = peerInfo.id.toB58String();

    // If already have a PubSub conn, ignore
    if (peerSet[idB58Str] && peerSet[idB58Str].conn) {
      return;
    }

    libp2pNode.dialByPeerInfo(peerInfo, multicodec, gotConn);

    function gotConn(err, conn) {
      if (err) {
        return log.err(err);
      }

      // If already had a dial to me, just add the conn
      if (peerSet[idB58Str]) {
        peerSet[idB58Str].conn = conn;
      } else {
        peerSet[idB58Str] = {
          conn: conn,
          peerInfo: peerInfo,
          topics: []
        };
      }

      // TODO change  to pull-pushable
      var pt1 = new PassThrough();
      var pt2 = new PassThrough();

      peerSet[idB58Str].stream = pt1;
      pt1.pipe(pt2);
      var ptPull = toPull.duplex(pt2);

      pull(ptPull, lp.encode(), conn);

      if (subscriptions.length > 0) {
        // TODO send my subscriptions through the new conn
      }
    }
  };
};