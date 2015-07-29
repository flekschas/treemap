SELECT
  data_set.uuid AS data_set_uuid,
  data_set.id AS data_set_id,
  annotated_study.count
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
          COUNT(*) AS count
        FROM (
          SELECT DISTINCT node_id,attribute_id,study_id,assay_id,node_uuid,node_file_uuid,node_type,node_name,attribute_type,attribute_subtype,attribute_value,attribute_value_unit,node_species,node_genome_build,is_annotation,node_analysis_uuid,node_subanalysis,node_workflow_output
          FROM data_set_manager_annotatednode
          WHERE study_id = ''
        ) a
      ) AS annotated_node
      ON
      annotated_node.study_id = study.nodecollection_ptr_id
  ) AS annotated_study
  ON
  data_set.investigation_id = annotated_study.investigation_id;

SELECT
  COUNT(*) AS count,
  node.id,
  node.study_id,
FROM (
  SELECT DISTINCT node_id,attribute_id,study_id,assay_id,node_uuid,node_file_uuid,node_type,node_name,attribute_type,attribute_subtype,attribute_value,attribute_value_unit,node_species,node_genome_build,is_annotation,node_analysis_uuid,node_subanalysis,node_workflow_output
  FROM data_set_manager_annotatednode
) a;
