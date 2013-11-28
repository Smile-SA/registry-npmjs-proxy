var fs = require('fs');
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/app.log'), 'app');

var logger = log4js.getLogger('app'),
  http = require('http'),
  path = require('path'),
  url = require('url'),
  httpProxy = require('http-proxy'),
  NPMRequest = require('./lib/npmRequest'),
  Controller = require('./lib/controller'),
  config = require('./lib/configLoader'),
  Checker = require('./lib/checker')(config),
  replicator = require('./lib/replicator')(config);

var idleTimer;
function idle() {
  logger.info('Idle since %s ms', config.idleDelay);
  replicator.triggerReplication();
}
function notIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(idle, config.idleDelay);
}

http.globalAgent.maxSockets = 200;
logger.debug(http.globalAgent.maxSockets);

http.createServer(function (request, response) {
  logger.info('%s %s', request.method, request.url);
  notIdle();

  try {
    var npmRequest = new NPMRequest(request);
  } catch (e) {
    logger.error(e);
    response.writeHead(500);
    response.end();
    return;
  }

  if (npmRequest.shoulBeProxied()) {
    // TODO: manage https for password protection

    var configUrlObj = url.parse(config.hasLocalRegistry() ? config.local.url : config.central[0].url);
    request.url = path.join(configUrlObj.pathname, request.url);

    var hostname = configUrlObj.hostname;
    var port = configUrlObj.port || 80;

    logger.debug('Routing %s to %s', npmRequest.url, url.format({
      protocol: 'http',
      hostname: hostname,
      port: port,
      pathname: request.url
    }));

    new httpProxy.RoutingProxy().proxyRequest(request, response, {
      host: hostname,
      port: port
    });
  } else {
    var controller = new Controller(npmRequest, response, replicator, config);

    var checker = new Checker(request);
    if (config.hasLocalRegistry()) {
      checker.check(config.local).on('response', function (error, response, body) {
        controller.emit('newResponse', 'local', error, response, body);
      });
    }

    for (var i in config.central) {
      checker.check(config.central[i]).on('response', function (error, response, body) {
        controller.emit('newResponse', config.central[i].id, error, response, body);
      });
    }
  }
}).listen(config.port, function () {
    logger.info('Server running at http://localhost:%s', config.port);
  });