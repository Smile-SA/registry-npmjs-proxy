# registry-npmjs-proxy

Proxy for the npm registry. Can be used for registry balancing and/or local (partial) replication

This is one of my first node.js application, so there should be (a lot of) room for improvement in code and architecture.

## How it works

Two (non-exclusive) modes are available:

### Registry balancing

Requests from npm users are forwarded on several "central" registries (e.g.: http://registry.npmjs.org/ and http://registry.npmjs.eu/) and the first response is forwarded to the user.

In this mode, if the official registry (http://registry.npmjs.org/) is down, your npm continue to work without any manual intervention.

You can provide one to N registries (one is useless as you continue to be dependant on the official registry availability).

### Local replication

Requests from npm users are forwarded on the local registry and on the "central" registry(ies).
If the package is present (and up to date) on the local registry, its response is forwarder to the user.
If the package doesn't exist or is not up to date on the local registry, the response from (one of) the central registry(ies) is forwarded to the user
and a replication of the package is planned so that the next time, the package would be available in the local registry.

In this mode:

   * already used packages are available "locally": you save bandwidth and have a better latency
   * if the official registry (http://registry.npmjs.org/) is down, your can still install already used packages.
If you combine this mode with the registry balancing mode, you can even continue to install packages using a public replication of the official registry.


### Architecture

![Architecture diagram](/resources/architecture.png)

## Prerequisites (optional)

To use this proxy with a local replication, you need a functional Couchdb (v1.3.1) installation.

When Couchdb is running, create and configure the registry database using initCouchDbRegistry.sh (or manually, following https://github.com/isaacs/npmjs.org/tree/v1.0.1):

```sh
initCouchDbRegistry.sh http://[login]:[password]@[registryUrl]/registry
```

## Install

First, clone the repo. Then:

```sh
npm install
```

## Configure

   * Copy the "config.js.sample" file as "config.js"
   * Edit the "config.js" configuration file to fit your needs:
     * Configure the "proxyUrl" to match your proxy listening url
     * Uncomment and configure (if used) the "local" section with your Couchdb installation
     * Add / remove "central" registries (default configuration should be ok)

## Run

```sh
node app.js
```

## Use

On the npm user computer, configure npm to use your proxy:

```sh
npm set registry "[proxyUrl]"
```

## Configuration examples

### Balancing with 2 "central" registries

```javascript
var config = {
  // Url used for rewriting tarball urls. Should match the url of the proxy
  proxyUrl: "http://localhost:1337/",

  // Configuration of central registries (a list of mirrors can be provided)
  central: [
    {
      id: "central",
      url: "http://registry.npmjs.org/",
      couchDbRegistry: "http://isaacs.iriscouch.com/registry/",
      // The first registry with replicateFrom=true is used as replication source
      replicateFrom: true
    },
    {
      id: "europe",
      url: "http://registry.npmjs.eu/",
      couchDbRegistry: "http://176.9.4.195/registry/",
      // The first registry with replicateFrom=true is used as replication source
      replicateFrom: false
    }
  ]
}

module.exports = config;
```

### Local registry plus official registry

```javascript
var config = {
  // Url used for rewriting tarball urls. Should match the url of the proxy
  proxyUrl: "http://localhost:1337/",

  // Configuration of the local-hosted registry (optional)
  local: {
    url: "http://registry.intranet:5984/registry/_design/scratch/_rewrite/",
    couchDbRegistry: "http://login:password@registry.intranet:5984/registry/",
    replicate: "http://login:password@registry.intranet:5984/_replicate/"
  },

  // Configuration of central registries (a list of mirrors can be provided)
  central: [
    {
      id: "central",
      url: "http://registry.npmjs.org/",
      couchDbRegistry: "http://isaacs.iriscouch.com/registry/",
      // The first registry with replicateFrom=true is used as replication source
      replicateFrom: true
    }
  ]
}

module.exports = config;
```

### Local registry plus multiple "central" registries

```javascript
var config = {
  // Url used for rewriting tarball urls. Should match the url of the proxy
  proxyUrl: "http://localhost:1337/",

  // Configuration of the local-hosted registry (optional)
  local: {
    url: "http://registry.intranet:5984/registry/_design/scratch/_rewrite/",
    couchDbRegistry: "http://login:password@registry.intranet:5984/registry/",
    replicate: "http://login:password@registry.intranet:5984/_replicate/"
  },

  // Configuration of central registries (a list of mirrors can be provided)
  central: [
    {
      id: "central",
      url: "http://registry.npmjs.org/",
      couchDbRegistry: "http://isaacs.iriscouch.com/registry/",
      // The first registry with replicateFrom=true is used as replication source
      replicateFrom: true
    },
    {
      id: "europe",
      url: "http://registry.npmjs.eu/",
      couchDbRegistry: "http://176.9.4.195/registry/",
      // The first registry with replicateFrom=true is used as replication source
      replicateFrom: false
    }
  ]
}

module.exports = config;
```


## Future improvements

   * Manage https for password protection (when publishing a package)
   * Distinguish central registries and fallback registries: fallback registries would be requested only if the central registries are offline