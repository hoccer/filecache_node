var mongo = require('mongodb'),
   crypto = require('crypto'),
   sys = require('sys'),
   http = require('http'),
   url = require('url');
  
function toArray(obj) {
  var len = obj.length
    , arr = new Array(len);
  for (var i = 0; i < len; ++i) {
    arr[i] = obj[i];
  }
  return arr;
}

exports.authenticate = function(whitelist) {
  var db = new mongo.Db('hoccer_accounts', new mongo.Server("127.0.0.1", 27017));
  db.open(function() {});
  
  return function(req, res, next) {    
    var params = url.parse(req.url, true).query || {},
      reject = function(message) {      
        req.authenticated = false;
        req.errorMessage = message;
        next();
      },
      accept = function() {        
        req.authenticated = true;
        next();
      }
    
    accept();
    return;
    
    if (whitelist && whitelist['methods'] && whitelist['methods'].indexOf(req.method) != -1) {
      return;
    }

    if (params['api_key'] === undefined) {
      reject("missing api key"); return;
    }
    
    db.collection('accounts', function(err, collection) {
      collection.findOne({"api_key": params['api_key']}, {}, function(err, account) {
        if (!account) {
          reject("account not found"); return;
        } else {
          if (req.headers['origin']) {
            if (account.websites.indexOf(req.headers['origin']) == -1) {
              reject("api key is not valid for this website"); return;
            }
          } else {
            if (params['signature'] === undefined) {
              reject("missing signature"); return;
            }
            var url_without_signature = req.url.match(/(.*)\&signature=.*$/)[1];

            var calculated_hash = crypto.createHmac('sha1', account.shared_secret)
                                       .update(req.headers["x-forwarded-proto"] + "://" + req.headers.host + url_without_signature)
                                       .digest('base64');

            if (params['signature'] != calculated_hash)  {
              reject(); return;
            }
          }
          accept();
        }
      });
    });
  }
}