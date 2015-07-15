function neo4jD3Converter (results) {
  var child,
      currentChildName,
      currentParentName,
      data = results.data,
      i,
      lastNode,
      len,
      nodes = {
        'owl:Thing': {
          // Fortunately `owl:Thing` the mandatory root for any ontology.
          name: 'owl:Thing',
          children: []
        }
      },
      parent;

  // Determine which column corresponce to which node
  len = results.columns.length;
  for (i = 0; i < len; i++) {
    switch (results.columns[i]) {
      case 'parent':
        parent = i;
        break;
      case 'child':
        child = i;
        break;
    }
  }

  // Loop over all rows and build the tree
  len = data.length;
  for (i = 0; i < len; i++) {
    // Cache for speed
    // Extensive object nesting is expensive;
    currentChildName = data[i].row[child].name;
    currentParentName = data[i].row[parent].name;

    if (!(currentParentName in nodes)) {
      nodes[currentParentName] = {
        name: currentParentName,
        children: []
      };
    }

    if (!(currentChildName in nodes)) {
      nodes[currentChildName] = {
        name: currentChildName,
        children: []
      };
    }

    nodes[currentParentName].children.push(nodes[currentChildName]);
  }

  return nodes['owl:Thing'];
}

function Neo4jD3 ($q, Neo4J, settings) {
  // Private
  var d3Deferred = $q.defer();

  this.Neo4J = new Neo4J(
    settings.neo4jUrl,
    settings.neo4jUser,
    settings.neo4jPassword
  );

  this.Neo4J.query({
      statements: [{
        statement: "MATCH (parent:Class)<-[:`rdfs:subClassOf`]-(child) RETURN parent, child"
      }]
    })
    .$promise
    .then(function (response) {
      if (response.errors.length === 0) {
        try {
          var start = new Date().getTime();
          var d3Data = neo4jD3Converter(response.results[0]);
          d3Deferred.resolve(d3Data);
          var end = new Date().getTime();
          var time = end - start;
          console.log('Neo4J to D3 converter execution time: ' + time);
        } catch (error) {
          d3Deferred.reject(error);
          console.error(error);
        }
      }
      this.neo4jResponse = response;
    }.bind(this))
    .catch(function (error) {
      d3Deferred.reject(error);
      console.error(error);
    });

  this.d3 = d3Deferred.promise;
}

Object.defineProperty(
  Neo4jD3.prototype,
  'neo4jResponse', {
    configurable: false,
    enumerable: true,
    writable: true
});

Object.defineProperty(
  Neo4jD3.prototype,
  'd3', {
    configurable: false,
    enumerable: true,
    writable: true
});

angular
  .module('neo4jD3')
  .service('neo4jD3', [
    '$q',
    'Neo4J',
    'settings',
    Neo4jD3
  ]);
