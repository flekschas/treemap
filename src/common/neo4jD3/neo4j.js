function Neo4J ($resource, $window) {
  return function (url, user, password) {
    return $resource(
      url + '/db/data/transaction/commit/',
      {},
      {
        query: {
          method: 'POST',
          headers: {
            'Accept': 'application/json; charset=UTF-8',
            'Content-type': 'application/json',
            // Base64 encoding using `window.btoa`
            'Authorization': 'Basic: ' + $window.btoa(user + ':' + password)
          },
          isArray: false,
        }
      }
    );
  };
}

angular
  .module('neo4jD3')
  .factory('Neo4J', [
    '$resource',
    '$window',
    Neo4J
  ]);
