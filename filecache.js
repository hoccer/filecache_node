var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    sys = require('sys'),
    events = require('events');
    
var dirty = require('dirty'),
    connect = require('connect');
    
var       auth = require('./authenticate'),
    fileReader = require('./File'),
         utils = require('./utils');
         
var opts = require('tav').set();

var saveToFile = function(req, res, next) {
  var endHeader = function() {  
    if (req.authenticated === false) {
      var options = {"expires_at": new Date().getTime() / 1000 };
      files.set(req.params.uuid, options);
      
      res.writeHead(401);
      res.end(req.errorMessage || "authentification failed");
    } else if (req.authenticated === true){
      var options = { 
        "expires_at": new Date().getTime() / 1000 + (parseInt(req.params["expires_in"]) || 120),
        "size": parseInt(req.headers["content-length"]),
        "type": req.headers["content-type"],
        "content-disposition": req.headers['content-disposition']
      };
      
      files.set(req.params.uuid, options);
      
      var responseContent = req.headers['x-forwarded-proto'] + '://' + req.headers.host + '/v3/' +  req.params.uuid;
      
      res.writeHead(201, {'Content-Type': 'text/plain', 'Content-Length': responseContent.length});
      res.end(responseContent);        
    }
  }
  
  if (!req.file) {
    res.writeHead(500);
    res.end("File cound not be created");
    return;
  }
  
  if (req.file.isReady) {
    endHeader(); return;
  }
  req.file.on('ready', endHeader);
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


var FileWriter = function(uuid, req) {
  var that = this;

  var dataStream, ended = false;
  var buffer = [];

  events.EventEmitter.call(this);
    
  var ready = function() {
    dataStream.end();
    
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
    console.log("writen");
    ended = true;
    if (dataStream) {
      ready(); return;
    } 
  });    
}

sys.inherits(FileWriter, events.EventEmitter);

var paperclip = function() {
  return function(req, res, next) {
    if (req.method !== 'PUT') {
      console.log(req.method + " not saving"); 
      next();
      return;
      
    }
    
    var uuidRegexp = req.url.match(/\/v3\/(.{36})/);
    if (!uuidRegexp) {
      console.log("no uuid"); 
      next();
      return;
    }
    
    var uuid = uuidRegexp[1];
    req.file = new FileWriter(uuid, req);

    next();
  }
}

function fileCache(app) {
  app.get('/v3/:uuid', loadFile);
  app.put('/v3/:uuid', saveToFile);
  app.options('/v3/:uuid', options);
}

process.chdir(__dirname);
var started = false;

files = dirty('data/dirty');

connect.createServer(
  connect.logger(),
  paperclip(),
  auth.authenticate({methods: 'GET'}),
  connect.router(fileCache)
).listen(opts["port"]);
  
sys.log('Server running at http://127.0.0.1:' + opts['port'] + '/');
