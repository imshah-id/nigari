package server

import (
	"os"
	"strings"
	"testing"
)

// A new instance's starter page shows nigari's own mark, not the shaker emoji
// (🧂) left over from before the rename (#815), and the mark it points at is a
// file the app actually serves.
func TestTheStarterPageCarriesTheNigariMark(t *testing.T) {
	s := testServer(t)
	var icon, content string
	if err := s.db.QueryRow(`SELECT icon, content FROM pages WHERE title = 'Welcome to nigari'`).Scan(&icon, &content); err != nil {
		t.Fatalf("no starter page: %v", err)
	}
	if icon != "/logo.svg" {
		t.Errorf("starter page icon = %q, want the mark /logo.svg", icon)
	}
	if strings.Contains(content, "🧂") {
		t.Error("the starter page's text still carries the shaker emoji")
	}
	// The icon is served from the frontend's public folder (web/public is
	// copied to the root of the build).
	if _, err := os.Stat("../web/public" + icon); err != nil {
		t.Errorf("the starter page's icon %s is not a file the app serves: %v", icon, err)
	}
}
