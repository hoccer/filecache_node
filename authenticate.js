var mongo = require('mongodb'),
   crypto = require('crypto'),
   http = require('http');
  
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
        that.emit.apply(that, array[i]);
      }
    }    
  }(this._eventBuffer), 20);

  this._eventBuffer = null;
}

exports.authenticate = function() {
  var db = new mongo.Db('hoccer_development', new mongo.Server("127.0.0.1", 27017));
  db.open(function(){ console.log("open") });
  
  return function(req, res, next) {
    var reject = function(message) {
      res.writeHead(401);
      res.end(message || "authentification failed");
    }
  
    req.startBuffering();
    
    var apiResult = req.url.match(/api_key=(.+)&/);
    if (apiResult.length < 1) {
      reject("missing api key"); return;
    }
    var api_key = decodeURIComponent(apiResult[1].toString());
    console.log("api_key " + api_key);
    
    db.collection('accounts', function(err, collection) {
      collection.findOne({"api_key": api_key}, {}, function(err, account) {
        if (!account) {
          reject("account not found"); return;
        } else {
          var sigResult = req.url.match(/\&signature=(.+)$/);
          if (sigResult.length < 1) {
            reject("missing signature"); return;
          }
          
          
          var signature = decodeURIComponent(sigResult[1].toString());
          var url_without_signature = req.url.match(/(.*)\&signature=.*$/)[1];
        
          var calculated_hash = crypto.createHmac('sha1', account.shared_secret)
                                     .update("http://" + req.headers.host + url_without_signature)
                                     .digest('base64');
        
          console.log(calculated_hash - signature);
          if (signature != calculated_hash)  {
            reject(); return;
          }
  
          req.stopBuffering();
          next();
        }
      });
    });
  }
}