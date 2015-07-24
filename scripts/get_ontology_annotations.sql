# Write STDOUT to `annotations.txt`
# For more information regarding COPY look at
# http://www.postgresql.org/docs/9.0/static/sql-copy.html
\o annotations.csv
COPY (
  SELECT
    data_set.uuid AS data_set_uuid,
    data_set.id AS data_set_id,
    annotated_study.investigation_id,
    annotated_study.study_id,
    annotated_study.assay_id,
    annotated_study.id AS node_id,
    annotated_study.file_uuid,
    annotated_study.type,
    annotated_study.subtype,
    annotated_study.value,
    annotated_study.value_source,
    annotated_study.value_accession
  FROM
    (
      SELECT
        core_dataset.uuid,
        core_dataset.id,
        investigation.investigation_id
      FROM
        core_dataset
        JOIN
        core_investigationlink AS investigation
        ON
        core_dataset.id = investigation.data_set_id
    ) AS data_set
    JOIN
    (
      SELECT
        study.investigation_id AS investigation_id,
        annotated_node.*
      FROM
        data_set_manager_study AS study
        JOIN
        (
          SELECT
            node.id,
            node.study_id,
            node.type,
            node.file_uuid,
            node.assay_id,
            attr.subtype,
            attr.value,
            attr.value_source,
            attr.value_accession
          FROM
            data_set_manager_node AS node
            JOIN
            data_set_manager_attribute AS attr
            ON
            node.id = attr.node_id
          WHERE
            attr.value_source IS NOT NULL AND
            attr.value_source NOT LIKE ''
        ) AS annotated_node
        ON
        annotated_node.study_id = study.nodecollection_ptr_id
    ) AS annotated_study
    ON
    data_set.investigation_id = annotated_study.investigation_id
)
TO STDOUT (FORMAT csv, DELIMITER ";", HEADER TRUE, QUOTE "'");
