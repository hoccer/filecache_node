var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys');
    
var nStore = require('nstore'),
    connect = require('connect');
    
var       auth = require('./authenticate'),
    fileReader = require('./File'),
         utils = require('./utils');

var saveToFile = function(req, res, next) {
  var dataStream, ended = false;
  var buffer = "";
  var uuid = req.params.uuid;
  
  var endHeader = function() {
      dataStream.end();
      var response = 'http://localhost:9212/' +  req.params.uuid;
      res.writeHead(201, {'Content-Type': 'text/plain', "Content-Length": response.length});
      res.end(response);
  }
  
  var options = { 
    "expires_at": new Date().getTime() / 1000 + (parseInt(req.params["expires_in"]) || 120),
    "size": parseInt(req.headers["content-length"]),
    "type": req.headers["content-type"],
    "content-disposition": req.headers['content-disposition']
  };
  
  files.save(uuid, options, function(err) {});
  
  utils.inCreatedDirectory(utils.splittedUuid(uuid), function(path) {
    console.log("create file " + path);
    
    dataStream = fs.createWriteStream(path + uuid);
    dataStream.write(buffer);
    
    if (ended) {
      endHeader(); return;
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
      endHeader(); return;
    } 
  });  
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
    "Access-Control-Allow-Origin": "HTTP_ORIGIN",    
    "Access-Control-Allow-Methods": "POST, PUT",
    "Access-Control-Allow-Headers": "X-Requested-With, X-File-Name, Content-Type, Content-Disposition"
  });
}

function fileCache(app) {
  app.get('/v3/:uuid', loadFile);
  app.put('/v3/:uuid', saveToFile);
  app.options('/v3/:uuid', options);
}

var started = false;
var files = nStore.new('data/files', function() {
  if (started) {return;}
  
  connect.createServer(
    connect.logger(),
    auth.authenticate(),
    connect.router(fileCache)
  ).listen(9212);
  
  console.log('Server running at http://127.0.0.1:9212/');
  started = true;
});