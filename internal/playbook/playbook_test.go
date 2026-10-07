package playbook

import (
	"testing"
	"testing/fstest"
)

func TestLoad_EmbeddedContentIsValid(t *testing.T) {
	lib, err := Load()
	if err != nil {
		t.Fatalf("embedded content must load: %v", err)
	}
	if len(lib.List()) == 0 {
		t.Fatal("expected at least one embedded page")
	}
	if _, ok := lib.Get("mulai"); !ok {
		t.Fatal(`expected page "mulai"`)
	}
}

func TestLoadFS_Validation(t *testing.T) {
	good := `{"slug":"a","title":"A","order":2,"blocks":[{"type":"paragraph","text":"x"}]}`
	cases := []struct {
		name    string
		files   map[string]string
		wantErr bool
	}{
		{"valid", map[string]string{"content/a.json": good}, false},
		{"bad json", map[string]string{"content/a.json": `{`}, true},
		{"bad slug", map[string]string{"content/a.json": `{"slug":"../a","title":"A"}`}, true},
		{"uppercase slug", map[string]string{"content/a.json": `{"slug":"Aa","title":"A"}`}, true},
		{"no title", map[string]string{"content/a.json": `{"slug":"a","title":" "}`}, true},
		{"unknown block", map[string]string{"content/a.json": `{"slug":"a","title":"A","blocks":[{"type":"script","text":"x"}]}`}, true},
		{"empty text", map[string]string{"content/a.json": `{"slug":"a","title":"A","blocks":[{"type":"paragraph","text":""}]}`}, true},
		{"empty steps", map[string]string{"content/a.json": `{"slug":"a","title":"A","blocks":[{"type":"steps"}]}`}, true},
		{"duplicate slug", map[string]string{
			"content/a.json": good,
			"content/b.json": `{"slug":"a","title":"B"}`,
		}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fsys := fstest.MapFS{}
			for name, body := range tc.files {
				fsys[name] = &fstest.MapFile{Data: []byte(body)}
			}
			_, err := loadFS(fsys, "content")
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

func TestLibrary_OrderAndLookup(t *testing.T) {
	fsys := fstest.MapFS{
		"content/b.json": {Data: []byte(`{"slug":"b","title":"B","order":2}`)},
		"content/a.json": {Data: []byte(`{"slug":"a","title":"A","order":1}`)},
		"content/c.json": {Data: []byte(`{"slug":"c","title":"C","order":2}`)},
	}
	lib, err := loadFS(fsys, "content")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, s := range lib.List() {
		got = append(got, s.Slug)
	}
	if want := "a,b,c"; join(got) != want {
		t.Fatalf("order = %s, want %s", join(got), want)
	}
	for _, bad := range []string{"", "..", "../a", "a/b", "A", "zzz", `a%2f`} {
		if _, ok := lib.Get(bad); ok {
			t.Fatalf("Get(%q) must not be found", bad)
		}
	}
}

func join(s []string) string {
	out := ""
	for i, v := range s {
		if i > 0 {
			out += ","
		}
		out += v
	}
	return out
}
