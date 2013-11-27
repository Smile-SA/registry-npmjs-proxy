// Inspired from https://github.com/mojombo/semver/issues/110#issuecomment-19433284, but more permissive (allow leading zeros) and non capturing
var versionRegexp = '(\\d+\\.\\d+\\.\\d+(?:-(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)'

var searchRegexp = new RegExp('^\\/-\\/all(.*)\\/?$');
var specifiedVersionRegexp = new RegExp('^\\/([^\\/]+)\\/' + versionRegexp + '\\/?$');
var latestVersionRegexp = new RegExp('^\\/([^\\/]+)\\/latest\\/?$');
var packageNameRegexp = new RegExp('^\\/([^\\/]+)\\/?$');
var tarballRegexp = new RegExp('^\\/([^/]+)\\/-\\/[^/]+?-' + versionRegexp + '\\.tgz$');

// URLs starting with '/-/' are used for "adduser", "publish", ... commands of npm and should be proxied directly to couchDb
var proxiedRegexp = new RegExp('/^\\/-\\/.*/');

var NPMRequest = function (requestParam) {
  if (this.parsed) return;

  this.startTime = new Date();
  this.url = requestParam.url;

  if (requestParam.method == 'POST' || requestParam.method == 'PUT' || (requestParam.method == 'GET' && requestParam.url.match(proxiedRegexp))) {
    this.toProxy = true;
  } else {
    var search = this.url.match(searchRegexp);
    if (search != null) {
      this.search = true;
    } else {
      var specifiedVersion = this.url.match(specifiedVersionRegexp);
      if (specifiedVersion != null) {
        this.packagename = specifiedVersion[1];
        this.version = specifiedVersion[2];
      } else {
        var latestVersion = this.url.match(latestVersionRegexp);
        if (latestVersion != null) {
          this.packagename = latestVersion[1];
        } else {
          var packageName = this.url.match(packageNameRegexp);
          if (packageName != null) {
            this.packagename = packageName[1];
            this.latestVersion = true;
          } else {
            var tarball = this.url.match(tarballRegexp);
            if (tarball != null) {
              this.packagename = tarball[1];
              this.version = tarball[2];
              this.tarball = true;
            } else {
              throw new Error('Unknown request format: ' + this.url);
            }
          }
        }
      }
    }
  }
  this.parsed = true;
};
NPMRequest.prototype.isSpecifiedVersion = function () {
  return this.version != null;
};
NPMRequest.prototype.getPackageName = function () {
  return this.packagename;
};
NPMRequest.prototype.getVersion = function () {
  return this.version;
};
NPMRequest.prototype.isLatestVersion = function () {
  return this.latestVersion === true;
};
NPMRequest.prototype.isTarball = function () {
  return this.tarball === true;
};
NPMRequest.prototype.isSearch = function () {
  return this.search === true;
};
NPMRequest.prototype.shoulBeProxied = function () {
  return this.toProxy === true;
};

module.exports = NPMRequest;