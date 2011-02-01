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
  
  this._onData = function() {
    this._eventBuffer.push(['data'].concat(toArray(arguments)));
  };
  
  this._onEnd = function() {
    this._eventBuffer.push(['end'].concat(toArray(arguments)));
  }
  
  this.addListener('data', this._onData);
  this.addListener('end', this._onEnd);  
}

http.IncomingMessage.prototype.stopBuffering = function() {
  that = this;

  setTimeout(function() {
    return function() {
      that.removeListener('data', that._onData);
      that.removeListener('end', that._onEnd);
      
      for (var i = 0; i < that._eventBuffer.length; i++) {
        that.emit.apply(that, that._eventBuffer[i]);
      }
      
      that._eventBuffer = null;
    }    
  }(), 20);
}

exports.authenticate = function(whitelist) {
  var db = new mongo.Db('hoccer_development', new mongo.Server("127.0.0.1", 27017));
  db.open(function(){ sys.debug("open") });
  
  return function(req, res, next) {    
    sys.debug("authenticate");
    
    var reject = function(message) {
      sys.debug("reject: " + message)
      
      req.authenticated = false;
      req.errorMessage = message;
      
      var options = {"expires_at": new Date().getTime() / 1000 };
      files.save(req.params.uuid, options, function(err) {});
    }
  
    var accept = function() {        
        req.authenticated = true;
        var options = { 
          "expires_at": new Date().getTime() / 1000 + (parseInt(req.params["expires_in"]) || 120),
          "size": parseInt(req.headers["content-length"]),
          "type": req.headers["content-type"],
          "content-disposition": req.headers['content-disposition']
        };

        files.save(req.params.uuid, options, function(err) {});
    }
  
    if (whitelist && whitelist['methods'] && whitelist['methods'].indexOf(req.method) != -1) {
      return;
    }
        
    var apiResult = req.url.match(/api_key\=([a-z0-9]+)($|\&.+$)/);
    if (!apiResult || apiResult.length < 1) {
      reject("missing api key"); return;
    }
    var api_key = decodeURIComponent(apiResult[1].toString());
    sys.debug("api_key " + api_key);
    
    db.collection('accounts', function(err, collection) {
      collection.findOne({"api_key": api_key}, {}, function(err, account) {
        if (!account) {
          reject("account not found"); return;
        } else {
          if (req.headers['origin']) {
            if (account.websites.indexOf(req.headers['origin']) == -1) {
              reject("api key is not valid for this website"); return;
            }
          } else {
            var sigResult = req.url.match(/\&signature=(.+)$/);
            if (!sigResult || sigResult.length < 1) {
              reject("missing signature"); return;
            }

            var signature = decodeURIComponent(sigResult[1].toString());
            var url_without_signature = req.url.match(/(.*)\&signature=.*$/)[1];

            var calculated_hash = crypto.createHmac('sha1', account.shared_secret)
                                       .update(req.headers["x-forwarded-proto"] + "://" + req.headers.host + url_without_signature)
                                       .digest('base64');

            sys.debug(calculated_hash + " - " + signature);
            if (signature != calculated_hash)  {
              reject(); return;
            }
          }
          accept();
        }
      });
    });
  }
}