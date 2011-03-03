var fileWriter = require('lib/file_writer'),
    
 paperclip = function() {
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
    req.file = new fileWriter.File(uuid, req);

    next();
  }
}

exports.clip = paperclip;