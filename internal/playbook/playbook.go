// Package playbook holds the recruitment guide shown to travels on a 12-month plan. The pages are JSON files
// embedded in the binary: they are not tenant data, so there is no repository and no migration. Who may read
// them is decided in service.CanAccessPlaybook and enforced by handler.PlaybookHandler.
package playbook

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strings"
)

//go:embed content/*.json
var contentFS embed.FS

// Block types a page may contain. The dashboard renders each one; keep both sides in step.
const (
	BlockHeading   = "heading"   // Text
	BlockParagraph = "paragraph" // Text
	BlockSteps     = "steps"     // Items, numbered
	BlockChecklist = "checklist" // Items, static checklist
	BlockTemplate  = "template"  // Text (title in Items[0] optional), copyable message
)

var validBlockTypes = map[string]bool{
	BlockHeading:   true,
	BlockParagraph: true,
	BlockSteps:     true,
	BlockChecklist: true,
	BlockTemplate:  true,
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Block is one piece of page content.
type Block struct {
	Type  string   `json:"type"`
	Text  string   `json:"text,omitempty"`
	Items []string `json:"items,omitempty"`
}

// Page is one guide page.
type Page struct {
	Slug    string  `json:"slug"`
	Title   string  `json:"title"`
	Summary string  `json:"summary"`
	Order   int     `json:"order"`
	Blocks  []Block `json:"blocks"`
}

// Summary is a page without its blocks, for the index.
type Summary struct {
	Slug    string `json:"slug"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Order   int    `json:"order"`
}

// Library is the loaded, validated set of pages.
type Library struct {
	pages map[string]Page
	index []Summary
}

// Load reads the embedded pages. It fails on a malformed page, so a bad content file is caught at start-up.
func Load() (*Library, error) {
	return loadFS(contentFS, "content")
}

func loadFS(fsys fs.FS, dir string) (*Library, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, fmt.Errorf("playbook: read %s: %w", dir, err)
	}
	lib := &Library{pages: map[string]Page{}}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := fs.ReadFile(fsys, path.Join(dir, e.Name()))
		if err != nil {
			return nil, fmt.Errorf("playbook: read %s: %w", e.Name(), err)
		}
		var p Page
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, fmt.Errorf("playbook: parse %s: %w", e.Name(), err)
		}
		if err := validate(p); err != nil {
			return nil, fmt.Errorf("playbook: %s: %w", e.Name(), err)
		}
		if _, dup := lib.pages[p.Slug]; dup {
			return nil, fmt.Errorf("playbook: %s: duplicate slug %q", e.Name(), p.Slug)
		}
		lib.pages[p.Slug] = p
		lib.index = append(lib.index, Summary{Slug: p.Slug, Title: p.Title, Summary: p.Summary, Order: p.Order})
	}
	sort.Slice(lib.index, func(i, j int) bool {
		if lib.index[i].Order != lib.index[j].Order {
			return lib.index[i].Order < lib.index[j].Order
		}
		return lib.index[i].Slug < lib.index[j].Slug
	})
	return lib, nil
}

func validate(p Page) error {
	if !slugPattern.MatchString(p.Slug) {
		return fmt.Errorf("invalid slug %q", p.Slug)
	}
	if strings.TrimSpace(p.Title) == "" {
		return fmt.Errorf("page %q has no title", p.Slug)
	}
	for i, b := range p.Blocks {
		if !validBlockTypes[b.Type] {
			return fmt.Errorf("page %q block %d: unknown type %q", p.Slug, i, b.Type)
		}
		switch b.Type {
		case BlockHeading, BlockParagraph, BlockTemplate:
			if strings.TrimSpace(b.Text) == "" {
				return fmt.Errorf("page %q block %d (%s): empty text", p.Slug, i, b.Type)
			}
		case BlockSteps, BlockChecklist:
			if len(b.Items) == 0 {
				return fmt.Errorf("page %q block %d (%s): no items", p.Slug, i, b.Type)
			}
		}
	}
	return nil
}

// List returns the page summaries in reading order.
func (l *Library) List() []Summary {
	out := make([]Summary, len(l.index))
	copy(out, l.index)
	return out
}

// Get returns a page by slug. An invalid or unknown slug is simply not found.
func (l *Library) Get(slug string) (Page, bool) {
	if !slugPattern.MatchString(slug) {
		return Page{}, false
	}
	p, ok := l.pages[slug]
	return p, ok
}
