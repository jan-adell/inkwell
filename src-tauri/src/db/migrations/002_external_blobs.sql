-- Migration 002: add external blob path columns for heavy content
-- This migration is additive and reversible: it only adds nullable columns.

ALTER TABLE document_contents ADD COLUMN blob_path TEXT;
ALTER TABLE entities ADD COLUMN bio_blob_path TEXT;

-- No data is moved here; a data-migration tool will export existing content
-- from content_json into files and populate these columns.
