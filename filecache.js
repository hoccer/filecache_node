var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys'),
    events = require('events');
    
var nStore = require('nstore'),
    connect = require('connect');

function toArray(obj) {
  var len = obj.length
    , arr = new Array(len);
  for (var i = 0; i < len; ++i) {
    arr[i] = obj[i];
  }
  return arr;
}

http.IncomingMessage.prototype.startBuffering = function() {
  this._eventBuffer = [];
  this.on('data', function() {
    this._eventBuffer.push(['data'].concat(toArray(arguments)));
  });
  this.on('end', function() {
    this._eventBuffer.push(['end'].concat(toArray(arguments)));
  })  
}

http.IncomingMessage.prototype.stopBuffering = function() {
  that = this;
  this.removeAllListeners('data');
  this.removeAllListeners('end');
  
  setTimeout(function(array) {
    return function() {
      for (var i = 0; i < array.length; i++) {
        console.log("replaying " + sys.inspect(array[i]));
        that.emit.apply(that, array[i]);
      }
    }    
  }(this._eventBuffer), 20);

  this._eventBuffer = null;
}

var File = function(uuid) {
  var that = this;
  var path = splittedUuid(uuid).concat(["data"]).join("/");
  
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
  
  files.get(uuid, function(err, doc, meta) {
    that.options = doc || err;
    
    isReady();
  });
}

sys.inherits(File, events.EventEmitter);

File.prototype.expired = function() {
//  return false;
  return this.options.expires_at <= new Date().getTime() / 1000;
}

File.prototype.doesExists = function() {
  return this.exists;
}

File.prototype.streamTo = function(res) {
  var that = this;
  if (!that.exists) throw new Error("File " + that.path + " does not exists");

  res.writeHead(200, {
    'Content-Type': that.options.type
  });
  

  var sendChunkBeginning = function() {
    var readStream = fs.createReadStream(that.path);

    readStream.on('data', function(data) {
      that.sentBytes = data.length;  
      res.write(data)
    });

    readStream.on('end', function() {
      console.log("end sent: " + that.options.size);
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



var inCreatedDirectory = function(dicts, callback) {
  var createDirRecursiv = function(dictionaries, path, callback) {
    if (dictionaries.length == 0) {
      callback.call(this, path);
      return;
    }

    path = (path || "") + dictionaries[0] + "/";
    fs.stat(path, function(err, data) {
      if (err && err.errno == 2) {
        fs.mkdir(path, 0777, function() {
          createDirRecursiv(dictionaries.slice(1), path, callback);
        });
      } else {
        createDirRecursiv(dictionaries.slice(1), path, callback);
      }
    });  
  }
  
  createDirRecursiv(dicts, "", callback);
}

var splittedUuid = function(uuid) {
  var compact_uuid = uuid.replace(/[-\/]/g, "");
  return ["data", compact_uuid.slice(0, 4), compact_uuid.slice(4,8)];
}

var saveToFile = function(req, res, next) {
  var dataStream, ended = false;
  var buffer = "";
  var uuid = req.params.uuid;
  
  var endHeader = function() {
      dataStream.end();
      res.writeHead(201, {'Content-Type': 'text/plain'});
      res.end('http://localhost:9876/' +  req.params.uuid);
  }
  
  var options = { 
    "expires_at": new Date().getTime() / 1000 + (parseInt(req.params["expires_in"]) || 120),
    "size": parseInt(req.headers["content-length"]),
    "type": req.headers["content-type"],
    "content-disposition": req.headers['content-disposition']
  };
  
  files.save(uuid, options, function(err) {});
  
  inCreatedDirectory(splittedUuid(uuid), function(path) {
    console.log("create file " + path);
    
    dataStream = fs.createWriteStream(path + "data");
    dataStream.write(buffer);
    
    if (ended) {
      endHeader();
    }
  });
  
  req.on('data', function(chunk) {
    console.log("data");
    if (dataStream) {
      dataStream.write(chunk);
    } else {
      buffer = chunk;
    }
  });

  req.on('end', function() {
    ended = true;
    if (dataStream) {
      endHeader();
    } 
  });  
}

var loadFile = function(req, res, next) {
  console.log("loadFile");
  var file = new File(req.params.uuid);
  file.on('ready', function(_file) {
    if (!_file.doesExists()) {
      res.writeHead(404);
      res.end("file not found");
    } else if (_file.expired()) {
      res.writeHead(404);
      res.end("file expired");
    } else {
      _file.streamTo(res);
    }
  });
}

var options = function(req, res, next) {
  res.writeHead(200, {
    "Access-Control-Allow-Origin": "HTTP_ORIGIN",    
    "Access-Control-Allow-Methods": "POST, PUT",
    "Access-Control-Allow-Headers": "X-Requested-With, X-File-Name, Content-Type, Content-Disposition"
  });
}

function fileCache(app) {
  app.get('/:uuid', loadFile);
  app.put('/:uuid', saveToFile);
  app.options('/:uuid', options);
}

var started = false;
var files = nStore.new('data/files', function() {
  if (started) {return;}
  
  connect.createServer(
    authorized,
    connect.router(fileCache)
  ).listen(9876);
  
  console.log('Server running at http://127.0.0.1:9876/');
  started = true;
});


var mongo = require('mongodb');
var crypto = require('crypto');

var db = new mongo.Db('hoccer_development', new mongo.Server("127.0.0.1", 27017));
db.open(function(){ console.log("open") });

var authorized = function(req, res, next) {
  var reject = function() {
    res.writeHead(401);
    res.end("authentification failed");
  }
  
  req.startBuffering();
  db.collection('accounts', function(err, collection) {
    collection.findOne({"api_key": "37d4b750fc95012d14a7109add515cd4"}, {}, function(err, account) {
      if (!account) {
        reject(); return;
      } else {
        var result = req.url.match(/\&signature=(.*)$/);
        if (result.length < 1) {
          reject(); return;
        }
        
        var signature = decodeURIComponent(result[1].toString());
        var url_without_signature = req.url.match(/(.*)\&signature=.*$/)[1];
        
        console.log("http://" + req.headers.host + url_without_signature);
        var calculated_hash = crypto.createHmac('sha1', account.shared_secret)
                                   .update("http://" + req.headers.host + url_without_signature)
                                   .digest('base64');
        
        
        if (signature != calculated_hash)  {
          reject(); return;
        }
  
        req.stopBuffering();
        next();
      }
    });
  });
}