var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/controller.log'), 'controller');

var revRegexp = /"_rev":"(.*?)"/;

var EventEmitter = require('events').EventEmitter;

var logger = log4js.getLogger('controller');

var Controller = function (npmRequest, clientResponse, replicator, config) {
  var eventEmitter = new EventEmitter();

  var responses = {
    'nbResponses': 0,
    'central': []
  };
  var responseSent = false;

  function response200(data) {
    clientResponse.writeHead(200);
    clientResponse.end(data);
  }

  function responseWithAppropriatedContent(server) {
    logger.debug('Responding with %s version of %s in %sms', server, npmRequest.url, (new Date() - npmRequest.startTime));
    if (isTarball()) {
      responseTarball(server);
    } else {
      responseWithProxyUrlReplacement(server);
    }
  }

  function responseTarball(server) {
    var response = getResponseFromServer(server).response;
    response.pipe(clientResponse)
  }

  function getResponseFromServer(serverId) {
    if (serverId === 'local') {
      return responses['local'];
    } else {
      return responses['central'][serverId];
    }
  }

  function responseWithProxyUrlReplacement(serverId) {
    getResponseFromServer(serverId).getBody(function (body) {
      var regexp;
      if (serverId == 'local') {
        regexp = config.local.regexp;
      } else {
        for (var i in config.central) {
          if (config.central[i].id == serverId) {
            regexp = config.central[i].regexp;
          }
        }
      }
      response200(body.replace(regexp, config.proxyUrl));
    });
  }

  function response500() {
    logger.error('Response 500 for %s', npmRequest.url);
    clientResponse.writeHead(500);
    clientResponse.end();
  }

  function storeResponse(serverId, error, response) {
    var responseJson = {
      error: error,
      response: response,
      _body: null,
      retrieveDataEmitter: null,
      _retrieveData: function () {
        if (this.retrieveDataEmitter) return this.retrieveDataEmitter;
        this.retrieveDataEmitter = new EventEmitter();
        var body = '',
          _this = this;

        response
          .on('data', function (chunk) {
            body += chunk;
          })
          .on('end', function () {
            _this.retrieveDataEmitter.emit('end', body);
          });
        return this.retrieveDataEmitter;
      },
      getBody: function (callback) {
        if (this._body) callback(this._body);

        this._retrieveData().on('end', function (body) {
          this._body = body;
          callback(body);
        });
      }
    }

    if (serverId === 'local') {
      responses['local'] = responseJson;
    } else {
      responses['central'][serverId] = responseJson;
    }
    responses.nbResponses++;
  }

  function isLocalResponse(server) {
    return server == 'local';
  }

  function hasError(server) {
    return getResponseFromServer(server) == null || getResponseFromServer(server).error || getResponseFromServer(server).response.statusCode != 200;
  }

  function canReplyWithoutCentral() {
    return npmRequest.isSpecifiedVersion();
  }

  function isSearch() {
    return npmRequest.isSearch();
  }

  function isTarball() {
    return npmRequest.isTarball();
  }

  function canReply() {
    var localOK = getLocalResponse() != null || !config.hasLocalRegistry();
    var centralOK = getCentralResponse() != null;
    var allResponsesArrived = config.nbRegistries == responses.nbResponses;

    return (localOK && centralOK) || allResponsesArrived;
  }

  function hasSentResponse() {
    return responseSent;
  }

  function getLocalResponse() {
    return responses['local'];
  }

  /**
   * Returns the first correct (statusCode = 200) central response serverId
   * @returns {string}
   */
  function getCentralId() {
    for (var i in responses['central']) {
      if (responses['central'][i].response && responses['central'][i].response.statusCode == 200) {
        return i;
      }
    }
    return null;
  }

  function getCentralResponse() {
    var centralId = getCentralId();
    if (centralId != null) {
      return responses['central'][centralId];
    }
    return null;
  }

  function shouldReplicate() {
    var eventEmitter = new EventEmitter();

    if (!isTarball() && !isSearch() && getCentralId() != null) {
      if (hasError('local')) {
        logger.debug('The package "%s" doesn\'t exist on local registry', npmRequest.getPackageName());
        setTimeout(function () {
          eventEmitter.emit('ok');
        }, 0);
      } else {
        getLocalResponse().getBody(function (localBody) {
          getCentralResponse().getBody(function (centralBody) {
            try {
              var localVersion = localBody.match(revRegexp)[1];
              var centralVersion = centralBody.match(revRegexp)[1];
              if (centralVersion != localVersion) {
                logger.debug('Newer revision (%s) on central registry (local revision: %s) for package %s', centralVersion, localVersion, npmRequest.getPackageName());
                setTimeout(function () {
                  eventEmitter.emit('ok');
                }, 0);
              }
            } catch (e) {
              logger.error(e);
              logger.debug('Can\'t define version of package "%s"', npmRequest.getPackageName())
            }
          });
        });
      }
    }

    eventEmitter.then = function (callback) {
      this.on('ok', callback);
    };
    return eventEmitter;
  }

  function mergeSearch(localBody, centralBody) {
    var localObject = JSON.parse(localBody);
    var centralObject = JSON.parse(centralBody);
    var data = {};

    var startTime = new Date();
    // Central data have priority on local data
    for (var attrname in localObject) {
      data[attrname] = localObject[attrname];
    }
    for (var attrname in centralObject) {
      data[attrname] = centralObject[attrname];
    }
    logger.debug('Merged in %sms', new Date() - startTime);

    return JSON.stringify(data);
  }

  function manageSearch() {
    var centralResponse = getCentralResponse();
    if (!config.hasLocalRegistry()){
      if(centralResponse != null) {
        centralResponse.getBody(function (centralBody) {
          response200(mergeSearch('[]', centralBody));
        });
      } else {
        logger.error('Missing central data');
        response500();
      }
    } else {
      var localResponse = getLocalResponse();
      if (localResponse.response != null && localResponse.response.statusCode == 200 && centralResponse != null) {
        localResponse.getBody(function (localBody) {
          centralResponse.getBody(function (centralBody) {
            logger.debug('Merging local & central');

            response200(mergeSearch(localBody, centralBody));
          });
        });
      } else {
        logger.error('Missing data to merge local & central');
        response500();
      }
    }
  }

  function manageNewResponse(server) {
    // Send response immediately (without waiting for the central registry response) if it is possible
    if (config.hasLocalRegistry() && isLocalResponse(server) && !hasError(server) && canReplyWithoutCentral()) {
      responseSent = true;
      responseWithAppropriatedContent('local');
    }

    // Central registry and local registry (if provided) has responded and we haven't yet responded to the client
    if (canReply() && !hasSentResponse()) {
      responseSent = true;

      if (isSearch()) {
        manageSearch();
      } else {
        if (config.hasLocalRegistry() && !hasError('local')) {
          responseWithAppropriatedContent('local');
        } else if (!hasError(getCentralId())) {
          responseWithAppropriatedContent(getCentralId());
        } else {
          response500();
        }

        if (config.hasLocalRegistry()) {
          shouldReplicate().then(function () {
            replicator.planReplication(npmRequest.getPackageName());
          });
        }
      }
    }
  }

  eventEmitter.on('newResponse', function (server, error, response) {
    storeResponse(server, error, response);

    manageNewResponse(server);
  });

  return eventEmitter;
}

module.exports = Controller;