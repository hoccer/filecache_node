var   fs = require('fs'),
  events = require('events'),
     sys = require('sys'),
   utils = require('./utils');

var FileWriter = function(uuid, req) {
  var that = this;

  var dataStream, ended = false;
  var buffer = [];

  events.EventEmitter.call(this);
    
  var ready = function() {
    dataStream.end();
    dataStream.destroy();
    
    that.isReady = true;
    that.emit('ready');
  }
  
  utils.inCreatedDirectory(utils.splittedUuid(uuid), function(path) {    
    dataStream = fs.createWriteStream(path + uuid);
    for (var i = 0; i < buffer.length; i++) {
        dataStream.write(buffer[i]);
    }

    if (ended) {
      ready(); return;
    }
  });
  
  req.on('data', function(chunk) {
    if (dataStream) {
      dataStream.write(chunk);
    } else {
      buffer.push(chunk);
    }
  });

  req.on('end', function() {
    ended = true;
    if (dataStream) {
      ready(); return;
    } 
  });    
}

sys.inherits(FileWriter, events.EventEmitter);

exports.File = FileWriter;