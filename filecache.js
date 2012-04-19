var  dirty = require('dirty'),
   connect = require('connect'),
   express = require('express'),
      auth = require('./authenticate'),
fileReader = require('./lib/file_reader'),
 paperclip = require('./lib/paperclip'),
     utils = require('./lib/utils'),
        fs = require('fs'),
    daemon = require('daemon'),
        qs = require('querystring'),
       url = require('url');

var opts = require('tav').set();

var sayHello = function(req, res, next) {
    res.writeHead(200);
    res.end('This is the Hoccer filecache.');
};

var saveToFile = function(req, res, next) {

  var endHeader = function() {
    var params = (qs.parse(url.parse(req.url).query)),
        expires_in = parseInt(params["expires_in"]);

    if (req.authenticated === false) {
      var options = {"expires_at": new Date().getTime() / 1000 };
      files.set(req.params.uuid, options);
      expires_in = 0;

      res.writeHead(401);
      res.end(req.errorMessage || "authentification failed");
    } else if (req.authenticated === true){
      console.log((new Date().getTime() / 1000), expires_in, (new Date().getTime() / 1000) + expires_in);

      var options = {
        "expires_at": (new Date().getTime() / 1000) + expires_in,
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
      files.rm(uuid);
      utils.inCreatedDirectory(utils.splittedUuid(uuid), function(path) {
        fs.unlink(path + uuid, function() {
          console.log("deleted" + uuid);
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

var loadFromFile = function(req, res, next) {
  var file = new fileReader.File(req.params.uuid, files);
  file.on('ready', function(_file) {
    if (!_file.doesExists()) {
      res.writeHead(404);
    } else if (_file.expired()) {
      res.writeHead(404);
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
  app.get('/', sayHello);
  app.get('/v3/:uuid', loadFromFile);
  app.put('/v3/:uuid', saveToFile);
  app.options('/v3/:uuid', options);
}

process.chdir(__dirname);
var started = false;

var files = dirty('data/file_cache');


var listenPort = opts["port"];
if(!listenPort) {
    listenPort = 9412;
    console.log('Defaulting port to ' + listenPort);
}

var listenAddress = opts["address"];
if(!listenAddress) {
    listenAddress = '0.0.0.0';
    console.log('Defaulting address to ' + listenAddress);
}

var pidFile = opts["pid"];
if(!pidFile) {
    pidFile = "filecache.pid";
    console.log('Defaulting pid file to ' + pidFile);
}

var logFile = opts["log"];
if(!logFile) {
    logFile = "filecache.log";
    console.log('Defaulting log file to ' + logFile);
}

var daemonize = false;

function banner() {
    console.log(">>>>>>>>>> Hoccer Filecache <<<<<<<<<<");
    console.log("Server running at http://" + listenAddress + ":" + listenPort + "/");
}

function start() {

    console.log("Attempting to start filecache");

    express.createServer(
        connect.logger(),
        paperclip.clip(),
        auth.authenticate({methods: 'GET'}),
        express.router(fileCache)
    ).listen(listenPort, listenAddress);

    if(daemonize) {
        var fileDescriptors = {
            stdout: logFile, stderr: logFile
        };
        function daemonizeDone(err, started) {
            if(err) {
                console.log("Error starting daemon: " + err);
                return;
            }

            banner();
        }
        daemon.daemonize(fileDescriptors, pidFile, daemonizeDone);
    } else {
        banner();
    }
}

function stop() {

    console.log("Attempting to stop filecache");

    function killDone(err, pid) {
        if(err) {
            console.log("Error stopping daemon with pid " + pid + ": " + err);
        } else {
            console.log("Stopped daemon with pid " + pid);
        }
    }

    daemon.kill(pidFile, killDone);
}

switch(opts.args[0]) {
default:
    daemonize = false;
    start();
    break;
case "start":
    daemonize = true;
    start();
    break;
case "stop":
    daemonize = true;
    stop();
    break;
}
