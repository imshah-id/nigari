package server

import (
	"fmt"
	"testing"
	"testing/fstest"
)

// BenchmarkPageComments is opening the comments panel on a page with 200
// comments, without reactions and with three on each (spec 017, SC-003).
// Measured against the list before reactions existed in the pull request
// that added them.
func BenchmarkPageComments(b *testing.B) {
	for _, n := range []int{0, 3} {
		b.Run(fmt.Sprintf("reactions=%d", n), func(b *testing.B) { benchPageComments(b, n) })
	}
}

func benchPageComments(b *testing.B, reactions int) {
	s := testServerB(b)
	page := newID()
	if _, err := s.db.Exec(`INSERT INTO pages (id, title, content, created_at, updated_at) VALUES (?, 'Doc', '', ?, ?)`, page, now(), now()); err != nil {
		b.Fatal(err)
	}
	keys := []string{"thumbs_up", "heart", "eyes"}[:reactions]
	for i := 0; i < 200; i++ {
		id := newID()
		at := fmt.Sprintf("2026-11-16T10:%02d:%02dZ", i/60, i%60)
		if _, err := s.db.Exec(`INSERT INTO comments (id, page_id, author_id, author_name, body, created_at) VALUES (?, ?, 'u', 'Ada', 'A comment of a few words', ?)`, id, page, at); err != nil {
			b.Fatal(err)
		}
		for j, k := range keys {
			if _, err := s.db.Exec(`INSERT INTO comment_reactions (comment_id, user_id, user_name, reaction, created_at) VALUES (?, ?, 'Someone', ?, ?)`, id, fmt.Sprint("u", j), k, at); err != nil {
				b.Fatal(err)
			}
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		list, err := s.pageComments(page, "u1")
		if err != nil || len(list) != 200 {
			b.Fatalf("%d comments, %v", len(list), err)
		}
	}
}

func testServerB(b *testing.B) *Server {
	b.Helper()
	s, err := New(b.TempDir(), fstest.MapFS{"index.html": {Data: []byte("<html></html>")}})
	if err != nil {
		b.Fatalf("New: %v", err)
	}
	b.Cleanup(func() { s.Close() })
	return s
}
