MATCH path=(c:Class {name:'CL:0000003'})-[*]->(n:Class {name:'owl:Thing'}) RETURN nodes(path);
