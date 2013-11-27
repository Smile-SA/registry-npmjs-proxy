#!/bin/bash

if [ -z $1 ]; then
  echo "Usage: $0 registryUrl"
  echo "Example: http://login:password@registry.npmjs.intranet/registry"
  exit 42
fi

REGISTRY=$1

curl -X DELETE $1
curl -X PUT $1

if [ ! -d "npmjs.org" ]; then
  git clone https://github.com/isaacs/npmjs.org.git
  cd npmjs.org
  npm install couchapp
  npm install semver
else
  cd npmjs.org
fi

couchapp push www/app.js $1
couchapp push registry/app.js $1