var log4js = require('log4js');
log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('logs/replication.log'), 'replication');

// TODO: use http instead of request module ?
var request = require('request'),
  logger = log4js.getLogger('replication');

var packagesToReplicate = [];

var Replicator = function (config) {
  function getRepositoryToReplicateFrom() {
    for (var i in config.central) {
      if (config.central[i].replicateFrom === true) {
        return config.central[i]
      }
    }
    return config.central[0];
  }

  var repositoryToReplicateFrom = getRepositoryToReplicateFrom();

  var replicationTimeout = config.replicationTimeout;

  function getRequestParams(package) {
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      json: true,
      timeout: replicationTimeout,
      url: config.local.replicate,
      body: getRequestBody(package)
    };
  }


  function getRequestBody(package) {
    return JSON.stringify({
      "source": repositoryToReplicateFrom.couchDbRegistry,
      "target": config.local.couchDbRegistry,
      "doc_ids": [package]
    });
  }

  function cancelReplication(package) {
    var requestParams = getRequestParams(package);
    requestParams.body.cancel = true;

    logger.warn('Replication timeout (>%sms) for "%s" package...', replicationTimeout, package);

    request(requestParams, function (error, response, body) {
      if (response && response.statusCode == 200 && body && body.ok === true) {
        logger.warn('Stopped replication of %s', package);
      } else {
        logger.error('Couldn\'t stop replication of %s', package);
        logger.error(error);
      }
    });
  }

  var planReplication = function (package) {
    if (packagesToReplicate.indexOf(package) == -1) {
      packagesToReplicate.push(package);
    }
  }

  var replicate = function (package) {
    var requestParams = getRequestParams(package);

    logger.info('Replicating "%s" package...', package);
    logger.debug(config.local.replicate);
    logger.debug(requestParams.body);

    var replicationTimer = setTimeout(function () {
      cancelReplication(package)
    }, replicationTimeout);

    request(requestParams, function (error, response, body) {
      if (response && response.statusCode == 200 && body && body.ok === true) {
        logger.info('Replication of %s successful', package);
        clearTimeout(replicationTimer);
      } else {
        logger.error('Replication error on %s', package);
        logger.error(error);
      }
    });
  }

  var triggerReplication = function () {
    while (packagesToReplicate.length > 0) {
      var package = packagesToReplicate.shift();
      replicate(package);
    }
  }

  // TODO: add a function to list pending replications ?

  return {
    planReplication: planReplication,
    triggerReplication: triggerReplication
  }
}

module.exports = Replicator;