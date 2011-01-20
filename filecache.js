var http = require('http'),
    fs = require('fs'),
    url = require('url');

var inCreatedDirectory = function(dicts, callback) {
  var createDirRecursiv = function(dictionaries, path, callback) {
    if (dictionaries.length == 0) {
      console.log(callback);
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

var saveToFile = function(req, res) {
  var writeStream, buffer;
  var ended = false;
  
  var uuid = url.parse(req.url).pathname;
  var compact_uuid = uuid.replace(/[-\/]/g, "");
  
  var endHeader = function() {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello World\n');
  }
  
  inCreatedDirectory([compact_uuid.slice(0, 6), compact_uuid.slice(6)], function(path) {
    var writeStream = fs.createWriteStream(path + "data");
    writeStream.write(buffer);
    
    if (ended) {
      writeStream.end();
      endHeader();
    }
  });
  
  req.on('data', function(chunk) {
    console.log(chunk);
    if (writeStream) {
      writeStream.write(chunk);
    } else {
      buffer = chunk;
    }
  });

  req.on('end', function() {
    ended = true;
    if (writeStream) {
      writeStream.end();
      endHeader();
    } 
  });  
}


http.createServer(function (req, res) {
  if (req.method == "PUT") {
    saveToFile(req, res);
  }
}).listen(8124, "0.0.0.0");

console.log('Server running at http://127.0.0.1:8124/');