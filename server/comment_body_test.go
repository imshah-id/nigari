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
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM comments WHERE page_id = ?`, page).Scan(&n); err != nil {
			t.Fatalf("count comments: %v", err)
		}
		return n
	}
	var lastREST string
	rest := func(body string) int {
		b, _ := json.Marshal(map[string]string{"body": body})
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/pages/"+page+"/comments", strings.NewReader(string(b)))
		req.Header.Set("Cookie", cookie)
		req.Header.Set("Content-Type", "application/json")
		s.ServeHTTP(rec, req)
		lastREST = rec.Body.String()
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
	} else if !strings.Contains(lastREST, `"comment_too_long"`) {
		// The browser translates the refusal from this code (serverErrors.ts).
		t.Errorf("REST refusal carries no comment_too_long code: %s", lastREST)
	}
	err := mcp(tooLong)
	if err == nil {
		t.Error("MCP took a comment over the limit")
	} else if !strings.Contains(err.Error(), "limited to") {
		t.Errorf("MCP refusal does not say why: %v", err)
	}
	if count() != 2 {
		t.Errorf("a comment over the limit was stored: %d comments", count())
	}

	// Whitespace around the text is trimmed before it is stored, and before it
	// is counted: a comment at the limit with a trailing newline is taken by
	// both doors.
	if code := rest("\n" + atLimit + "\n  "); code != 200 {
		t.Errorf("REST counted the trimmed whitespace: %d", code)
	}
	if err := mcp("\n" + atLimit + "\n  "); err != nil {
		t.Errorf("MCP counted the trimmed whitespace: %v", err)
	}
	if count() != 4 {
		t.Fatalf("want 4 comments stored, have %d", count())
	}

	// Empty after trimming is refused on both doors too.
	if code := rest("   "); code != 400 {
		t.Errorf("REST took an empty comment: %d", code)
	}
	if err := mcp("   "); err == nil {
		t.Error("MCP took an empty comment")
	}
}
