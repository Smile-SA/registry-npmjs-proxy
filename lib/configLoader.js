var config = require('./../config');

/**
 * Transform in canonical form
 */
function normalization(config) {
  for (var i in config) {
    if (typeof config[i] === 'string') {
      // Remove trailing '/' in strings
      config[i] = config[i].replace(/\/$/, '');
    } else if (typeof config[i] === 'object'){
      config[i] = normalization(config[i]);
    }
  }
  return config;
}

config = normalization(config);

// Init nb registries
config.nbRegistries = 0;

// Default listening port
config.port = config.port || 1337;

// Default delay for a central registry response when the local response has been received
config.centralRegistryWait = config.centralRegistryWait || 1000;

// Default idle delay (waiting time before replication triggering)
config.idleDelay = config.idleDelay || 30 * 1000;

// Default replication timeout (waiting time before considering a replication will not finish)
config.replicationTimeout = config.replicationTimeout || 5 * 60 * 1000;

// Computing local registry info
config.hasLocalRegistry = function () {
  return config.local != null && config.local.url != null && config.local.couchDbRegistry != null && config.local.replicate != null;
}
if (config.hasLocalRegistry()) {
  config.nbRegistries++;
  config.local.regexp = new RegExp(config.local.url, 'g');
  config.local.id = 'local';
}

// Computing central registries info
for (var i in config.central) {
  config.nbRegistries++;
  config.central[i].regexp = new RegExp(config.central[i].url, 'g');
  config.central[i].id = config.central[i].id || 'central_' + i;
}

module.exports = config;