'use strict';

var fs = require('fs');
var path = require('path');
var protobuf = require('protocol-buffers');

var rpcSchema = fs.readFileSync(path.join(__dirname, 'rpc.proto'));

var topicDescriptorSchema = fs.readFileSync(path.join(__dirname, 'topic-descriptor.proto'));

exports = module.exports;
exports.rpc = protobuf(rpcSchema);
exports.td = protobuf(topicDescriptorSchema);