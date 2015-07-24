function buildTree (results) {
  var child,
      // Stores the children of each node..
      // The only difference to `nodes` is that the `children` is an object
      // holding the name of the child node.
      childIndex = {
        'owl:Thing': {}
      },
      currentChild,
      currentDataSet,
      currentParent,
      data = results.data,
      dataSet,
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
      case 'child':
        child = i;
        break;
      case 'dataSet':
        dataSet = i;
        break;
      case 'parent':
        parent = i;
        break;
    }
  }

  // Loop over all rows and build the tree
  len = data.length;
  for (i = 0; i < len; i++) {
    // Cache for speed:
    // Extensive object nesting is expensive;
    currentChild = data[i].row[child];
    currentDataSet = data[i].row[dataSet];
    currentParent = data[i].row[parent];

    if (!(currentParent.name in nodes)) {
      nodes[currentParent.name] = {
        children: [],
        dataSets: [],
        name: currentParent.name,
        numDataSets: 0,
        ontID: currentParent.name
      };
    }

    if (!(currentChild.name in nodes)) {
      nodes[currentChild.name] = {
        children: [],
        dataSets: [],
        name: currentChild.name,
        numDataSets: 0,
        ontID: currentChild.name
      };
    }

    if ('rdfs:label' in currentChild) {
      nodes[currentChild.name].name = currentChild['rdfs:label'];
    }

    if ('uri' in currentChild) {
      nodes[currentChild.name].uri = currentChild.uri;
    }

    if (currentDataSet !== null) {
      nodes[currentChild.name].numDataSets++;
      nodes[currentChild.name].dataSets.push(currentDataSet.uuid);
    }

    if (!(currentParent.name in childIndex)) {
      childIndex[currentParent.name] = {};
    }

    if (!(currentChild.name in childIndex[currentParent.name])) {
      nodes[currentParent.name].children.push(nodes[currentChild.name]);
      childIndex[currentParent.name][currentChild.name] = true;
    }
  }

  // Deep clone object to be usable by D3
  var tmp = JSON.parse(JSON.stringify(nodes['owl:Thing']));
  console.log(tmp);
  return tmp;
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
        statement: "MATCH (parent:cl:Class)<-[:`rdfs:subClassOf`]-(child) " +
          "OPTIONAL MATCH (dataSet:DataSet)-[:`annotated_with`]->(child) " +
          "RETURN parent, child, dataSet"
      }]
    })
    .$promise
    .then(function (response) {
      if (response.errors.length === 0) {
        try {
          var start = new Date().getTime();
          var d3Data = buildTree(response.results[0]);
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
