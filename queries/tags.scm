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

; %INCLUDE → import
(include_statement
  source: (string_literal) @import.source) @import

; LIBNAME → import (library path)
(libname_statement
  (string_literal) @import.source) @import
