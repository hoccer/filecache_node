var  dirty = require('dirty'),
   connect = require('connect');
      auth = require('./authenticate'),
fileReader = require('lib/file_reader'),
 paperclip = require('lib/paperclip'),
     utils = require('lib/utils');
        fs = require('fs')
         
var opts = require('tav').set();

var saveToFile = function(req, res, next) {
  
  var expires_in = parseInt(req.params["expires_in"]) || 120;
  console.log("exp " + expires_in)
  
  var endHeader = function() {  
    if (req.authenticated === false) {
      var options = {"expires_at": new Date().getTime() / 1000 };
      files.set(req.params.uuid, options);
      
      res.writeHead(401);
      res.end(req.errorMessage || "authentification failed");
    } else if (req.authenticated === true){
      var options = { 
        "expires_at": new Date().getTime() / 1000 + expires_in,
        "size": parseInt(req.headers["content-length"]),
        "type": req.headers["content-type"],
        "content-disposition": req.headers['content-disposition']
      };
      
      var responseContent = req.headers['x-forwarded-proto'] + '://' + req.headers.host + '/v3/' +  req.params.uuid;
      res.writeHead(201, {'Content-Type': 'text/plain', 'Content-Length': responseContent.length});
      res.end(responseContent);        
    }
    
    files.set(req.params.uuid, options);
    
    setTimeout(function() {
      var uuid = req.params.uuid;
      console.log("remove " + uuid);
      files.rm(uuid);
      utils.inCreatedDirectory(utils.splittedUuid(uuid), function(path) {    
        fs.unlink(path + uuid, function() {
          console.log("deleted");
        });
      });
    }, expires_in * 1000);
    
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
  paperclip.clip(),
  auth.authenticate({methods: 'GET'}),
  connect.router(fileCache)
).listen(opts["port"]);
  
console.log('Server running at http://127.0.0.1:' + opts['port'] + '/');
