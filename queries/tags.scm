; Macro definitions → definition.macro
(macro_definition
  name: (macro_name) @name) @definition.macro

; Macro call statements → call
(macro_call_statement
  name: (macro_name) @call.name) @call

; Inline macro calls (inside DATA/PROC steps, %let values, etc.)
(macro_call
  name: (macro_name) @call.name) @call

; DATA step → definition.module
(data_step
  (data_step_header
    (dataset_name
      (identifier) @name))) @definition.module

; PROC step → definition.module
(proc_step
  (proc_step_header
    name: (identifier) @name)) @definition.module

; %INCLUDE → import (string literal form)
(include_statement
  source: (string_literal) @import.source) @import

; %INCLUDE → import (fileref form: FILEREF or FILEREF(member.sas))
(include_statement
  source: (fileref_source) @import.source) @import

; LIBNAME → import (library path)
(libname_statement
  (string_literal) @import.source) @import

; PROC SQL output tables (CREATE TABLE AS)
(sql_create_statement
  output: (dataset_name) @name) @definition.module

; PROC SQL input tables (FROM clause)
(sql_select_statement
  (table_reference
    (dataset_name) @import.source)) @import

; PROC SQL input tables (JOIN clause)
(sql_select_statement
  (sql_join_clause
    (table_reference
      (dataset_name) @import.source))) @import

; DATA step SET inputs → import (dataset lineage)
(data_step
  (set_statement
    (dataset_name) @import.source)) @import

; DATA step MERGE inputs → import (dataset lineage)
(data_step
  (merge_statement
    (dataset_name) @import.source)) @import

; DATA step UPDATE inputs → import (dataset lineage)
(data_step
  (update_statement
    (dataset_name) @import.source)) @import
