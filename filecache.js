var http = require('http'),
    fs = require('fs'),
    url = require('url');
var nstore = require('nstore');

var inCreatedDirectory = function(dicts, callback) {
  var createDirRecursiv = function(dictionaries, path, callback) {
    if (dictionaries.length == 0) {
      callback.call(this, path);
      return;
    }

    path = (path || "") + dictionaries[0] + "/";
    fs.stat(path, function(err, data) {
      if (err && err.errno == 2) {
        fs.mkdir(path, 7777, function() {
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


var saveToFile = function(req, res) {
  var dataStream, buffer, ended = false;
  var uuid = url.parse(req.url).pathname;

  var endHeader = function() {
      dataStream.end();
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World\n');
  }
  
  files.save(uuid, { "expires", res.params["expires_at"] });
  
  inCreatedDirectory(splittedUuid(uuid), function(path) {
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

var loadFile = function(req, res) {
  var uuid = url.parse(req.url).pathname;
  
  var path = splittedUuid(uuid).concat(["data"]).join("/");
  var readStream = fs.createReadStream(path);

  res.writeHead(200, {'Content-Type': 'text/plain'});

  readStream.on('data', function(data) {
    res.write(data)
  });

  readStream.on('end', function() {
    res.end();
  });
}

// var loadFile = function(req, res) {
//   with_file(path, function(file) {
//     if (!file.exists || file.expired) {
//       res.writeHead(404);
//       res.end();
//       return;
//     }
//     
//     file.streamTo(res);
//   });
// }

var files = nStore.new('data/files', function() {
  http.createServer(function (req, res) {
    if (req.method == "PUT") {
      saveToFile(req, res);
    } else if (req.method == "GET") {
      loadFile(req, res);
    }
  }).listen(8124, "0.0.0.0");

  console.log('Server running at http://127.0.0.1:8124/');
  
});