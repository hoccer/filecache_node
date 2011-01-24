var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys'),
    events = require('events');
    
var nStore = require('nstore'),
    connect = require('connect');



var File = function(uuid) {
  var path = splittedUuid(uuid).concat(["data"]).join("/");
  
  events.EventEmitter.call(this);
  this.path = path;
  
  that = this;
  fs.stat(path, function(err, data) {
    that.exists = !err;
    that.stat = data;
    that.emit('ready', that);
  });
  
  nStore.get(uuid, function(err, doc, meta) {
    console.log(sys.inspect(doc));
  });
}

sys.inherits(File, events.EventEmitter);

File.prototype.streamTo = function(res) {
  if (!this.exists) throw new Error("File " + this.path + " does not exists");
  
  var readStream = fs.createReadStream(this.path);
  
  res.writeHead(200, {'Content-Type': 'text/plain'});
  
  readStream.on('data', function(data) {
    res.write(data)
  });
  
  readStream.on('end', function() {
    res.end();
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
  return [compact_uuid.slice(0, 4), compact_uuid.slice(4)];
}


var saveToFile = function(req, res, next) {
  var dataStream, buffer, ended = false;
  var uuid = req.params.uuid;
  
  var endHeader = function() {
      dataStream.end();
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World\n');
  }
  
  files.save(uuid, { "expires_at": req.params["expires_at"] || 7 }, function(err) {
    console.log("saved");
  });
  
  inCreatedDirectory(splittedUuid(uuid), function(path) {
    console.log("create file " + path);
    
    dataStream = fs.createWriteStream(path + "data");
    dataStream.write(buffer);
    
    if (ended) {
      endHeader();
    }
  });
  
  req.on('data', function(chunk) {
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
  
  var file = new File(req.params.uuid);
  file.on('ready', function(_file) {
    if (_file.exists) {
      _file.streamTo(res);
    } else {
      res.writeHead(404);
      res.end("file not found");
    }
  });
}

function fileCache(app) {
  app.get('/:uuid', loadFile);
  app.put('/:uuid', saveToFile);
}

var started = false;
var files = nStore.new('data/files', function() {
  if (started) {return;}
  
  connect.createServer(
    connect.router(fileCache)
  ).listen(9876);
  
  console.log('Server running at http://127.0.0.1:9876/');
  started = true;
});