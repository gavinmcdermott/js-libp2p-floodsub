'use strict';

var config = require('./config');
var log = config.log;
var multicodec = config.multicodec;
var pull = require('pull-stream');
var _uniq = require('lodash.uniq');
var _intersection = require('lodash.intersection');
var lp = require('pull-length-prefixed');
var pb = require('./message');
var utils = require('./utils');

module.exports = mountFloodSub;

function mountFloodSub(libp2pNode, peerSet, tc, subscriptions, ee) {
  // note: we don't use the incomming conn to send, just to receive
  libp2pNode.handle(multicodec, incConn);

  function incConn(conn) {
    conn.getPeerInfo(function (err, peerInfo) {
      if (err) {
        log.err('Failed to identify incomming conn', err);
        return pull(pull.empty(), conn);
      }

      // populate
      var idB58Str = peerInfo.id.toB58String();

      if (!peerSet[idB58Str]) {
        peerSet[idB58Str] = {
          peerInfo: peerInfo,
          topics: []
        };
      }

      // process the messages
      pull(conn, lp.decode(), pull.drain(function (data) {
        var rpc = pb.rpc.RPC.decode(data);
        if (rpc.subscriptions) {
          rpc.subscriptions.forEach(function (subopt) {
            if (subopt.subscribe) {
              peerSet[idB58Str].topics.push(subopt.topicCID);
            } else {
              var index = peerSet[idB58Str].topics.indexOf(subopt.topicCID);
              if (index > -1) {
                peerSet[idB58Str].topics.splice(index, 1);
              }
            }
          });

          peerSet[idB58Str].topics = _uniq(peerSet[idB58Str].topics);
        }

        if (rpc.msgs.length > 0) {
          rpc.msgs.forEach(function (msg) {
            // 1. check if I've seen the message, if yes, ignore
            if (tc.has(utils.msgId(msg.from, msg.seqno.toString()))) {
              return;
            } else {
              tc.put(utils.msgId(msg.from, msg.seqno.toString()));
            }

            // 2. emit to self
            msg.topicCIDs.forEach(function (topic) {
              if (subscriptions.indexOf(topic) !== -1) {
                ee.emit(topic, msg.data);
              }
            });

            // 3. propagate msg to others
            var peers = Object.keys(peerSet).map(function (idB58Str) {
              return peerSet[idB58Str];
            });

            peers.forEach(function (peer) {
              if (_intersection(peer.topics, msg.topicCIDs).length > 0) {
                var _rpc = pb.rpc.RPC.encode({
                  msgs: [msg]
                });

                peer.stream.write(_rpc);
              }
            });
          });
        }
      }, function (err) {
        if (err) {
          return log.err(err);
        }
        // TODO
        //   remove peer from peerSet
      }));
    });
  }
}