package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// Both doors to adding a comment run the same check (#645): the MCP comments
// tool stored a comment of any length, the REST route refused one over
// maxCommentLen. Each door is tried at the limit (stored) and one past it
// (refused, nothing stored).
func TestCommentLengthIsCheckedOnBothDoors(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "long@example.test")
	u := &user{ID: uid, Name: "Test"}
	ws := s.firstWorkspaceOf(t, uid)
	page := s.makePage(t, ws, uid, "", "Doc", `{}`)

	count := func() int {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM comments WHERE page_id = ?`, page).Scan(&n)
		return n
	}
	rest := func(body string) int {
		b, _ := json.Marshal(map[string]string{"body": body})
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/pages/"+page+"/comments", strings.NewReader(string(b)))
		req.Header.Set("Cookie", cookie)
		req.Header.Set("Content-Type", "application/json")
		s.ServeHTTP(rec, req)
		return rec.Code
	}
	mcp := func(body string) error {
		b, _ := json.Marshal(map[string]string{"page_id": page, "action": "add", "body": body})
		_, err := callTool(t, s, u, "comments", string(b))
		return err
	}

	// Counted in characters, not bytes: "é" is two bytes.
	atLimit := strings.Repeat("é", maxCommentLen)
	tooLong := atLimit + "x"

	if code := rest(atLimit); code != 200 {
		t.Fatalf("REST refused a comment at the limit: %d", code)
	}
	if err := mcp(atLimit); err != nil {
		t.Fatalf("MCP refused a comment at the limit: %v", err)
	}
	if count() != 2 {
		t.Fatalf("want 2 comments stored, have %d", count())
	}

	if code := rest(tooLong); code != 400 {
		t.Errorf("REST took a comment over the limit: %d", code)
	}
	err := mcp(tooLong)
	if err == nil {
		t.Error("MCP took a comment over the limit")
	} else if !strings.Contains(err.Error(), "too long") {
		t.Errorf("MCP refusal does not say why: %v", err)
	}
	if count() != 2 {
		t.Errorf("a comment over the limit was stored: %d comments", count())
	}

	// Empty after trimming is refused on both doors too.
	if code := rest("   "); code != 400 {
		t.Errorf("REST took an empty comment: %d", code)
	}
	if err := mcp("   "); err == nil {
		t.Error("MCP took an empty comment")
	}
}
