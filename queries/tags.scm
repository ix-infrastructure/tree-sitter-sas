; Macro definitions → definition.function
(macro_definition
  name: (macro_name) @name) @definition.function

; Macro calls → call
(macro_call_statement
  name: (macro_name) @name) @call

; DATA step → definition.block
(data_step
  (data_step_header
    (dataset_name
      (identifier) @name))) @definition.block

; PROC step → definition.block
(proc_step
  (proc_step_header
    name: (identifier) @name)) @definition.block

; %INCLUDE → import
(include_statement
  source: (string_literal) @name) @import

; LIBNAME → import
(libname_statement
  libref: (identifier) @name
  (string_literal) @import.source) @import
