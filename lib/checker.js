var Checker = function (config) {
  var EventEmitter = require('events').EventEmitter,
    http = require('http');

  var log4js = require('log4js');
  log4js.loadAppender('file');
  log4js.addAppender(log4js.appenders.file('logs/local.log'), 'local');
  for (var i in config.central) {
    log4js.addAppender(log4js.appenders.file('logs/' + config.central[i].id + '.log'), config.central[i].id);
  }
  var logger = {
    local: log4js.getLogger('local')
  }
  for (var i in config.central) {
    logger[config.central[i].id] = log4js.getLogger(config.central[i].id);
  }

  var urlConcat = function () {
    var array = [];

    for (var i in arguments) {
      array[i] = arguments[i].replace(/\/$/, '').replace(/^\//, '');
    }

    return array.join('/');
  };

  return function (requestParam) {
    var req = requestParam;

    function check(serverConfig) {
      var eventEmitter = new EventEmitter();

      var urlToRequest = urlConcat(serverConfig.url, req.url);

      logger[serverConfig.id].debug('GET ' + urlToRequest);

      var startTime = new Date();
      http.get(urlToRequest,function (response) {
        var time = (new Date() - startTime);
        if (time < 100) {
          logger[serverConfig.id].debug('Response in %s ms for %s', time, urlToRequest);
        } else if (time < 500) {
          logger[serverConfig.id].info('Response in %s ms for %s', time, urlToRequest);
        } else {
          logger[serverConfig.id].warn('Response in %s ms for %s', time, urlToRequest);
        }

        eventEmitter.emit('response', null, response);
      }).on('error', function (error) {
          eventEmitter.emit('response', error, null);
        });

      return eventEmitter;
    }

    return {
      check: check
    };
  };
}

module.exports = Checker;