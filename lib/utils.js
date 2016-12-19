'use strict';

var sha1 = require('git-sha1');

exports = module.exports;

exports.randomSeqno = function () {
  return sha1((~~(Math.random() * 1e9)).toString(36) + Date.now());
};

exports.msgId = function (from, seqno) {
  return from + seqno;
};