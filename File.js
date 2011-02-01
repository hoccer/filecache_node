var    sys = require('sys'),
    events = require('events'),
        fs = require('fs'),
     utils = require('./utils');

var File = function(uuid, store) {
  var that = this;
  that.store = store;
  var path = utils.splittedUuid(uuid).concat([uuid]).join("/");
  
  events.EventEmitter.call(this);
  this.path = path;
    
  var isReady = function() {
    if (that.exists !== undefined && that.options) {
      that.emit('ready', that);
    }
  }
  
  fs.stat(path, function(err, data) {
    that.exists = !err;
    that.stat = data;
    
    isReady();
  });
  
  store.get(uuid, function(err, doc, meta) {
    that.options = doc || err;
    
    isReady();
  });
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
  

  var sendChunkBeginning = function(bytes) {
    var readStream = fs.createReadStream(that.path, { start: bytes, end: that.options.size });

    readStream.on('data', function(data) {
      console.log("readStream data " + that.sentBytes + " " + that.options.size);
      
      that.sentBytes += data.length;  
      res.write(data)
    });

    readStream.on('end', function() {
      console.log("readStream end " + that.sentBytes + " " + that.options.size);
      if (that.sentBytes >= that.options.size) {
        res.end();
        fs.unwatchFile(that.path);
      }
    });
  }
  
  sendChunkBeginning(0);
  
  fs.watchFile(that.path, function(curr, prev) {    
    sendChunkBeginning(that.sentBytes);
  });
}

exports.File = File;
