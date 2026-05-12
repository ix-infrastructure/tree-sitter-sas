package tree_sitter_sas_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_sas "github.com/ix-infrastructure/tree-sitter-sas/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_sas.Language())
	if language == nil {
		t.Errorf("Error loading SAS grammar")
	}
}
