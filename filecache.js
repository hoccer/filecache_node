var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys');
    
var nStore = require('nstore'),
    connect = require('connect');
    
var       auth = require('./authenticate'),
    fileReader = require('./File'),
         utils = require('./utils');
         
var opts = require('tav').set();

var saveToFile = function(req, res, next) {
  var dataStream, ended = false;
  var buffer = [];
  var uuid = req.params.uuid;
  
  var endHeader = function() {
    dataStream.end();
    
    var response = function() {
      if (req.authenticated === false) {
        res.writeHead(401);
        res.end(req.errorMessage || "authentification failed");
      } else if (req.authenticated === true){
        var response = req.headers['x-forwarded-proto'] + '://' + req.headers.host + '/v3/' +  req.params.uuid;
        res.writeHead(201, {'Content-Type': 'text/plain', 'Content-Length': response.length});
        res.end(response);
      } else {
        setTimeout(response, 300);
      }
    }
    
    response();
  }
    
  utils.inCreatedDirectory(utils.splittedUuid(uuid), function(path) {
    console.log("create file " + path);
    
    dataStream = fs.createWriteStream(path + uuid);
    for (var i = 0; i < buffer.length; i++) {
        dataStream.write(buffer[i]);
    }

    if (ended) {
      endHeader(); return;
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
      endHeader(); return;
    } 
  });  
  
  next();
}

var loadFile = function(req, res, next) {
  var file = new fileReader.File(req.params.uuid, files);
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
    "Access-Control-Allow-Origin": req.headers["origin"],    
    "Access-Control-Allow-Methods": "PUT",
    "Access-Control-Allow-Headers": "X-Requested-With, X-File-Name, Content-Type, Content-Disposition",
    "Content-Length": "0"
  });
  res.end();
}

function fileCache(app) {
  app.get('/v3/:uuid', loadFile);
  app.put('/v3/:uuid', saveToFile);
  app.options('/v3/:uuid', options);
}

process.chdir(__dirname);
var started = false;

files = nStore.new('data/files', function() {
  if (started) {return;}
  
  connect.createServer(
    connect.logger(),
    connect.router(fileCache),
    auth.authenticate({methods: 'GET'})
  ).listen(opts["port"]);
  
  console.log('Server running at http://127.0.0.1:' + opts['port'] + '/');
  started = true;
});