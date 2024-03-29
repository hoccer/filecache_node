var    sys = require('sys'),
    events = require('events'),
        fs = require('fs'),
     utils = require('./utils');

var File = function(uuid, store) {
  var that = this;
  var path = utils.splittedUuid(uuid).concat([uuid]).join("/");
  
  that.store = store;
  
  events.EventEmitter.call(this);
  this.path = path;
    
  var isReady = function() {    
    if (that.exists !== undefined && that.options ) {
      that.emit('ready', that);
    }
  }
  
  fs.stat(path, function(err, data) {
    that.exists = !err;
    that.stat = data;
    
    isReady();
  });
  
  
  var fetchOptions = function() {
      that.options = store.get(uuid);
      if (that.options === undefined) {
        setTimeout(fetchOptions, 200);
      } else {
        isReady();
      }
  }
  
  fetchOptions();
}

sys.inherits(File, events.EventEmitter);

File.prototype.expired = function() {
  return this.options.expires_at <= new Date().getTime() / 1000;
}

File.prototype.doesExists = function() {
  return this.exists;
}

File.prototype.streamTo = function(res) {
  var that = this;
  that.sentBytes = 0;  
  
  if (!that.exists) throw new Error("File " + that.path + " does not exists");

  res.writeHead(200, {
    'Content-Type': that.options.type,
    'Content-Disposition': that.options["content-disposition"],
    'Content-Length': that.options['size']
  });
  
  var readStream;
  var sendChunkBeginning = function(bytes) {
    if (readStream !== undefined && readStream.readable) {
      return;
    }
    
    readStream = fs.createReadStream(that.path, { start: bytes || 0, end: that.options.size });
    
    readStream.on('data', function(data) {
      that.sentBytes += data.length;  
      res.write(data)
    });

    readStream.on('end', function() {
      if (that.sentBytes >= that.options.size) {
        res.end();
        fs.unwatchFile(that.path);
        // readStream.destroy();
      }
    });
  }
  
  sendChunkBeginning(0);
  
  fs.watchFile(that.path, function(curr, prev) {
    sendChunkBeginning(that.sentBytes);
  });
}

exports.File = File;