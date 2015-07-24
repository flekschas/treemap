#!/usr/bin/env python
import py2neo
import sys


def read_annotations(file):
    first_line = True
    data = []
    header = []
    with open(file, 'r') as f:
        for line in f:
            line = line.strip('\n')
            entries = line.split(';')
            if (first_line):
                first_line = False
                header = entries
            else:
                obj = {}
                for i, entry in enumerate(entries):
                    obj[header[i]] = entry
                data.append(obj)
    return data


def normalize_ont_ids(annotations):
    new_annotations = []
    for annotation in annotations:
        underscore_pos = annotation['value_accession'].rfind('_')
        if (underscore_pos >= 0):
            annotation['value_accession'] = \
                annotation['value_accession'][(underscore_pos + 1):]
            new_annotations.append(annotation)
            continue

        hash_pos = annotation['value_accession'].rfind('#')
        if (hash_pos >= 0):
            annotation['value_accession'] = \
                annotation['value_accession'][(hash_pos + 1):]
            new_annotations.append(annotation)
            continue

        if (annotation['value_source'] == 'CL'):
            annotation['value_accession'] = \
                annotation['value_accession'].zfill(7)
            continue
    return new_annotations


def push_annotations_to_neo4j(annotations):
    # Connects to `http://localhost:7474/db/data/` by default.
    py2neo.authenticate("localhost:7474", "neo4j", "123")
    graph = py2neo.Graph()

    # Begin transaction
    tx = graph.cypher.begin()

    counter = 1
    statement_name = (
        "MATCH (term:Class {name:{ont_id}}) "
        "MERGE (ds:DataSet {uuid:{ds_uuid}}) "
        "MERGE ds-[:`annotated_with`]->term"
    )
    statement_uri = (
        "MATCH (term:Class {uri:{uri}}) "
        "MERGE (ds:DataSet {uuid:{ds_uuid}}) "
        "MERGE ds-[:`annotated_with`]->term"
    )

    for annotation in annotations:
        if ('value_uri' in annotation):
            tx.append(
                statement_uri,
                {
                    'uri': annotation['value_uri'],
                    'ds_uuid': annotation['data_set_uuid']
                }
            )
        else:
            tx.append(
                statement_name,
                {
                    'ont_id': (
                        annotation['value_source'] +
                        ':' +
                        annotation['value_accession']
                    ),
                    'ds_uuid': annotation['data_set_uuid']
                }
            )

        if (counter % 50 == 0):
            # Send Cypher queries to Neo4J after every 100 entries
            tx.process()

        # Increase counter
        counter = counter + 1

    # Commit transaction
    tx.commit()

if __name__ == "__main__":
    annotation_file = sys.argv[1]

    annotations = read_annotations(annotation_file)
    annotations = normalize_ont_ids(annotations)
    push_annotations_to_neo4j(annotations)
