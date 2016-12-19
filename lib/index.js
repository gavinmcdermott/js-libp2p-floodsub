'use strict';

var EE = require('events').EventEmitter;
var util = require('util');
var TimeCache = require('time-cache');
var utils = require('./utils');
var pb = require('./message');
var config = require('./config');
var log = config.log;
var _intersection = require('lodash.intersection');
var dialOnFloodSub = require('./dial-floodsub.js');
var mountFloodSub = require('./mount-floodsub.js');
var _values = require('lodash.values');

module.exports = PubSubGossip;

util.inherits(PubSubGossip, EE);

function PubSubGossip(libp2pNode, dagService) {
  var _this = this;

  if (!(this instanceof PubSubGossip)) {
    return new PubSubGossip(libp2pNode);
  }

  EE.call(this);

  var tc = new TimeCache();

  // map of peerIdBase58Str: { conn, topics, peerInfo }
  var peerSet = {};

  // list of our subscriptions
  var subscriptions = [];

  // map of peerId: [] (size 10)
  //   check if not contained + newer than older
  //   if passes, shift, push, sort
  //   (if needed, i.e. not the newest)

  var dial = dialOnFloodSub(libp2pNode, peerSet, subscriptions);
  mountFloodSub(libp2pNode, peerSet, tc, subscriptions, this);

  this.publish = function (topics, messages) {
    log('publish', topics, messages);
    if (!Array.isArray(topics)) {
      topics = [topics];
    }
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    // emit to self if I'm interested
    topics.forEach(function (topic) {
      if (subscriptions.indexOf(topic) !== -1) {
        messages.forEach(function (message) {
          _this.emit(topic, message);
        });
      }
    });

    // send to all the other peers
    var peers = Object.keys(peerSet).map(function (idB58Str) {
      return peerSet[idB58Str];
    });

    peers.forEach(function (peer) {
      if (_intersection(peer.topics, topics).length > 0) {
        var msgs = messages.map(function (message) {
          var msg = {
            from: libp2pNode.peerInfo.id.toB58String(),
            data: message,
            seqno: new Buffer(utils.randomSeqno()),
            topicCIDs: topics
          };
          tc.put(utils.msgId(msg.from, msg.seqno.toString()));
          return msg;
        });
        var rpc = pb.rpc.RPC.encode({
          msgs: msgs
        });

        peer.stream.write(rpc);
        log('publish msgs on topics', topics, peer.peerInfo.id.toB58String());
      }
    });
  };

  this.subscribe = function (topics) {
    if (!Array.isArray(topics)) {
      topics = [topics];
    }

    topics.forEach(function (topic) {
      if (subscriptions.indexOf(topic) === -1) {
        subscriptions.push(topic);
      }
    });

    var peers = Object.keys(peerSet).map(function (idB58Str) {
      return peerSet[idB58Str];
    });

    peers.forEach(function (peer) {
      var subopts = topics.map(function (topic) {
        return {
          subscribe: true,
          topicCID: topic
        };
      });
      var rpc = pb.rpc.RPC.encode({
        subscriptions: subopts
      });

      peer.stream.write(rpc);
    });
  };

  this.unsubscribe = function (topics) {
    if (!Array.isArray(topics)) {
      topics = [topics];
    }

    topics.forEach(function (topic) {
      var index = subscriptions.indexOf(topic);
      if (index > -1) {
        subscriptions.splice(index, 1);
      }
    });

    _values(peerSet).forEach(function (peer) {
      var subopts = topics.map(function (topic) {
        return {
          subscribe: false,
          topicCID: topic
        };
      });
      var rpc = pb.rpc.RPC.encode({
        subscriptions: subopts
      });

      peer.stream.write(rpc);
    });
  };

  this.getPeerSet = function () {
    return peerSet;
  };

  this.getSubscriptions = function () {
    return subscriptions;
  };

  function onStart() {
    var connectedPeers = libp2pNode.peerBook.getAll();
    _values(connectedPeers).forEach(dial);
  }
  onStart();

  // speed up any new peer that comes in my way
  libp2pNode.swarm.on('peer-mux-established', dial);
}