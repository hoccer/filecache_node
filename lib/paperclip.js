var fileWriter = require('./file_writer'),

paperclip = function() {
  return function(req, res, next) {
    var uuidRegexp = req.url.match(/\/v3\/(.{36})/)
      , uuid;

    if (req.method !== 'PUT') {
      next();
      return;
    }

    if (!uuidRegexp) {
      next();
      return;
    }

    uuid = uuidRegexp[1];
    req.file = new fileWriter.File(uuid, req);
    next();
  }
}

exports.clip = paperclip;
