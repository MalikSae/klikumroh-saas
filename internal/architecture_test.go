package internal_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestArchitectureNoDirectDBAccess enforces the architectural rule from AGENTS.md Bagian 3.1:
// All database access MUST go through /internal/repository.
// Direct imports of "database/sql" or MySQL drivers in /internal/handler, /internal/service,
// or /internal/middleware are strictly prohibited.
func TestArchitectureNoDirectDBAccess(t *testing.T) {
	// Find project root by resolving relative to this test file
	rootDir := filepath.Clean(filepath.Join(".", ".."))

	restrictedDirs := []string{
		filepath.Join(rootDir, "internal", "handler"),
		filepath.Join(rootDir, "internal", "service"),
		filepath.Join(rootDir, "internal", "middleware"),
	}

	prohibitedImports := map[string]bool{
		`"database/sql"`:                         true,
		`"github.com/go-sql-driver/mysql"`:      true,
		`"database/sql/driver"`:                  true,
	}

	fset := token.NewFileSet()

	for _, dir := range restrictedDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}

		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() || !strings.HasSuffix(info.Name(), ".go") {
				return nil
			}

			node, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
			if err != nil {
				t.Fatalf("Failed to parse file %s: %v", path, err)
			}

			for _, imp := range node.Imports {
				importPath := imp.Path.Value
				if prohibitedImports[importPath] {
					t.Errorf("Architecture Rule Violation in %s: prohibited database import %s found. Direct database access is ONLY allowed in /internal/repository and /cmd.", path, importPath)
				}
			}
			return nil
		})

		if err != nil {
			t.Fatalf("Failed to walk directory %s: %v", dir, err)
		}
	}
}
