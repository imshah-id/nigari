package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

// Spec 017: editing a comment, its earlier versions, reactions, and who may
// delete. Every action is tried on both doors, REST and MCP, because the
// doors drifted before: delete_comment let anyone who could write delete
// anybody's comment (FR-009).

type commentWorld struct {
	s                     *Server
	page                  string
	ws                    string
	admin, author, writer string // the workspace admin; two members who write
	viewer                string // a read-only member
	cookies               map[string]string
}

func newCommentWorld(t *testing.T) commentWorld {
	t.Helper()
	s := testServer(t)
	w := commentWorld{s: s, cookies: map[string]string{}}
	var c string
	w.admin, c = signedIn(t, s, "admin@example.test")
	w.cookies[w.admin] = c
	w.ws = s.firstWorkspaceOf(t, w.admin)
	for _, p := range []struct {
		id   *string
		mail string
		role string
	}{{&w.author, "author@example.test", "member"}, {&w.writer, "writer@example.test", "member"}, {&w.viewer, "viewer@example.test", "viewer"}} {
		id, cookie := signedIn(t, s, p.mail)
		*p.id = id
		w.cookies[id] = cookie
		if _, err := s.db.Exec(`INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)`, w.ws, id, p.role); err != nil {
			t.Fatal(err)
		}
	}
	w.page = s.makePage(t, w.ws, w.admin, "", "Doc", `{}`)
	return w
}

// comment adds one written by the author, through the REST route.
func (w commentWorld) comment(t *testing.T, body string) string {
	t.Helper()
	code, out := w.rest(w.author, "POST", "/api/pages/"+w.page+"/comments", map[string]string{"body": body})
	if code != 200 {
		t.Fatalf("add comment: %d %s", code, out)
	}
	var res struct{ ID string }
	json.Unmarshal([]byte(out), &res)
	return res.ID
}

func (w commentWorld) rest(who, method, path string, body any) (int, string) {
	var rd *strings.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	} else {
		rd = strings.NewReader("")
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Cookie", w.cookies[who])
	req.Header.Set("Content-Type", "application/json")
	w.s.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func (w commentWorld) mcp(t *testing.T, who, scope string, args map[string]string) (string, error) {
	t.Helper()
	if args["page_id"] == "" {
		args["page_id"] = w.page
	}
	b, _ := json.Marshal(args)
	u := &user{ID: who, Name: "Agent of " + who, TokenScope: scope, TokenKind: tokenKindAPI}
	return callTool(t, w.s, u, "comments", string(b))
}

func (w commentWorld) body(t *testing.T, id string) (body string, edited bool) {
	t.Helper()
	var e *string
	if err := w.s.db.QueryRow(`SELECT body, edited_at FROM comments WHERE id = ?`, id).Scan(&body, &e); err != nil {
		t.Fatalf("comment %s: %v", id, err)
	}
	return body, e != nil
}

func (w commentWorld) count(t *testing.T, q string, args ...any) int {
	t.Helper()
	var n int
	if err := w.s.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The author edits on both doors; the replaced text is kept and readable by
// a reader, newest first; the same text changes nothing; the edit is in the
// activity log once.
func TestTheAuthorEditsACommentOnBothDoors(t *testing.T) {
	w := newCommentWorld(t)
	id := w.comment(t, "First text")

	if code, out := w.rest(w.author, "PATCH", "/api/comments/"+id, map[string]string{"body": "  Second text "}); code != 200 || !strings.Contains(out, `"changed":true`) {
		t.Fatalf("REST edit by the author: %d %s", code, out)
	}
	if b, edited := w.body(t, id); b != "Second text" || !edited {
		t.Fatalf("after the REST edit: %q edited=%v", b, edited)
	}
	if out, err := w.mcp(t, w.author, "write", map[string]string{"action": "edit", "comment_id": id, "body": "Third text"}); err != nil || !strings.Contains(out, "Edited") {
		t.Fatalf("MCP edit by the author: %v %s", err, out)
	}
	if b, _ := w.body(t, id); b != "Third text" {
		t.Fatalf("after the MCP edit: %q", b)
	}

	// The same text again: nothing changes, no version (FR-004).
	versions := w.count(t, `SELECT COUNT(*) FROM comment_versions WHERE comment_id = ?`, id)
	if code, out := w.rest(w.author, "PATCH", "/api/comments/"+id, map[string]string{"body": "Third text\n"}); code != 200 || !strings.Contains(out, `"changed":false`) {
		t.Errorf("REST same text: %d %s", code, out)
	}
	if _, err := w.mcp(t, w.author, "write", map[string]string{"action": "edit", "comment_id": id, "body": "Third text"}); err != nil {
		t.Errorf("MCP same text: %v", err)
	}
	if got := w.count(t, `SELECT COUNT(*) FROM comment_versions WHERE comment_id = ?`, id); got != versions || got != 2 {
		t.Errorf("versions after two edits and two no-ops: %d (before the no-ops %d), want 2", got, versions)
	}

	// A read-only member reads every earlier version, newest first, on both
	// doors (FR-003).
	code, out := w.rest(w.viewer, "GET", "/api/comments/"+id+"/versions", nil)
	if code != 200 {
		t.Fatalf("versions for a reader: %d %s", code, out)
	}
	var vs []commentVersionJSON
	json.Unmarshal([]byte(out), &vs)
	if len(vs) != 2 || vs[0].Body != "Second text" || vs[1].Body != "First text" {
		t.Errorf("versions, newest first: %+v", vs)
	}
	hist, err := w.mcp(t, w.viewer, "read", map[string]string{"action": "history", "comment_id": id})
	if err != nil || !strings.Contains(hist, "Second text") || !strings.Contains(hist, "First text") || strings.Index(hist, "Second text") > strings.Index(hist, "First text") {
		t.Errorf("MCP history for a reader with a read token: %v %s", err, hist)
	}
	if !strings.Contains(hist, "UNTRUSTED CONTENT") {
		t.Errorf("MCP history is not wrapped as untrusted content: %s", hist)
	}

	// One activity entry per edit, each door counted once (R7).
	if got := w.count(t, `SELECT COUNT(*) FROM audit_log WHERE action = 'comment.edit' AND detail = ?`, id); got != 2 {
		t.Errorf("comment.edit entries: %d, want 2", got)
	}
	if got := w.count(t, `SELECT COUNT(*) FROM audit_log WHERE action = 'comment.edit' AND actor_type = 'agent'`); got != 1 {
		t.Errorf("the MCP edit's entry is not marked agent: %d", got)
	}
	if got := w.count(t, `SELECT COUNT(*) FROM audit_log WHERE action = 'comments'`); got != 0 {
		t.Errorf("the MCP edit also wrote a generic entry: %d", got)
	}

	// The list carries editedAt.
	_, list := w.rest(w.viewer, "GET", "/api/pages/"+w.page+"/comments", nil)
	if !strings.Contains(list, `"editedAt":"`) {
		t.Errorf("the list does not say the comment was edited: %s", list)
	}
}

// Nobody but the author edits: not another writer, not the workspace admin,
// not a read-only member, not the author's read-only token, not the author
// once they may no longer write; and the text rules of a new comment apply.
func TestOnlyTheAuthorEditsAComment(t *testing.T) {
	w := newCommentWorld(t)
	id := w.comment(t, "Mine")
	refusals := []struct {
		name  string
		who   string
		scope string
		want  string // REST status
	}{
		{"another writer", w.writer, "write", "403"},
		{"the workspace admin", w.admin, "write", "403"},
		{"a read-only member", w.viewer, "write", "403"},
	}
	for _, r := range refusals {
		code, out := w.rest(r.who, "PATCH", "/api/comments/"+id, map[string]string{"body": "Not yours"})
		if fmt.Sprint(code) != r.want {
			t.Errorf("REST edit by %s: %d %s, want %s", r.name, code, out, r.want)
		}
		if r.who != w.viewer && !strings.Contains(out, "comment_not_author") {
			t.Errorf("REST refusal for %s carries no comment_not_author code: %s", r.name, out)
		}
		if _, err := w.mcp(t, r.who, r.scope, map[string]string{"action": "edit", "comment_id": id, "body": "Not yours"}); err == nil {
			t.Errorf("MCP edit by %s went through", r.name)
		}
	}
	if _, err := w.mcp(t, w.author, "read", map[string]string{"action": "edit", "comment_id": id, "body": "Read token"}); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Errorf("the author's read-only token edited: %v", err)
	}
	for _, body := range []string{"   ", strings.Repeat("x", maxCommentLen+1)} {
		if code, _ := w.rest(w.author, "PATCH", "/api/comments/"+id, map[string]string{"body": body}); code != 400 {
			t.Errorf("REST edit to a %d-character body: %d, want 400", len(body), code)
		}
		if _, err := w.mcp(t, w.author, "write", map[string]string{"action": "edit", "comment_id": id, "body": body}); err == nil {
			t.Errorf("MCP edit to a %d-character body went through", len(body))
		}
	}
	// The author demoted to viewer: no longer writes on the page, so no edit.
	w.s.db.Exec(`UPDATE workspace_members SET role = 'viewer' WHERE user_id = ?`, w.author)
	if code, _ := w.rest(w.author, "PATCH", "/api/comments/"+id, map[string]string{"body": "Demoted"}); code != 403 {
		t.Errorf("REST edit by the demoted author: %d, want 403", code)
	}
	if b, edited := w.body(t, id); b != "Mine" || edited {
		t.Errorf("a refused edit changed the comment: %q edited=%v", b, edited)
	}
	// An outsider is told the comment does not exist, on both doors.
	outsider, cookie := signedIn(t, w.s, "outsider@example.test")
	w.cookies[outsider] = cookie
	// A page of the outsider's own, so the MCP call passes its page gate and
	// the comment's gate is what refuses.
	ownPage := w.s.makePage(t, makeWorkspace(t, w.s, outsider), outsider, "", "Own", `{}`)
	if code, _ := w.rest(outsider, "GET", "/api/comments/"+id+"/versions", nil); code != 404 {
		t.Errorf("versions for an outsider: %d, want 404", code)
	}
	if _, err := w.mcp(t, outsider, "write", map[string]string{"page_id": ownPage, "action": "history", "comment_id": id}); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("MCP history for an outsider: %v", err)
	}
}

// Reactions: on and off on both doors, once per person and reaction, counted
// across people, a glyph accepted over MCP, an unknown one refused naming the
// six, and nothing for a reader.
func TestReactionsOnBothDoors(t *testing.T) {
	w := newCommentWorld(t)
	id := w.comment(t, "React to me")
	base := "/api/comments/" + id + "/reactions/"
	rows := func() int {
		return w.count(t, `SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ?`, id)
	}

	for i := 0; i < 2; i++ { // twice: the second changes nothing
		if code, out := w.rest(w.writer, "PUT", base+"heart", nil); code != 200 {
			t.Fatalf("REST react: %d %s", code, out)
		}
	}
	if _, err := w.mcp(t, w.author, "write", map[string]string{"action": "react", "comment_id": id, "reaction": "❤"}); err != nil {
		t.Fatalf("MCP react with the glyph, no variation selector: %v", err)
	}
	if _, err := w.mcp(t, w.author, "write", map[string]string{"action": "react", "comment_id": id, "reaction": "heart"}); err != nil {
		t.Fatalf("MCP react twice: %v", err)
	}
	if rows() != 2 {
		t.Fatalf("two people, one reaction each, some twice: %d rows, want 2", rows())
	}

	_, list := w.rest(w.writer, "GET", "/api/pages/"+w.page+"/comments", nil)
	var cs []commentJSON
	json.Unmarshal([]byte(list), &cs)
	if len(cs) != 1 || len(cs[0].Reactions) != 1 {
		t.Fatalf("the list's reactions: %s", list)
	}
	r := cs[0].Reactions[0]
	if r.Reaction != "heart" || r.Count != 2 || !r.Mine || len(r.Users) != 2 {
		t.Errorf("heart for the writer: %+v", r)
	}
	_, list = w.rest(w.viewer, "GET", "/api/pages/"+w.page+"/comments", nil)
	if strings.Contains(list, `"mine":true`) {
		t.Errorf("the viewer, who did not react, sees one as theirs: %s", list)
	}

	if code, _ := w.rest(w.writer, "DELETE", base+"heart", nil); code != 200 {
		t.Errorf("REST unreact: %d", code)
	}
	if _, err := w.mcp(t, w.author, "write", map[string]string{"action": "unreact", "comment_id": id, "reaction": "❤️"}); err != nil {
		t.Errorf("MCP unreact: %v", err)
	}
	if rows() != 0 {
		t.Errorf("after both took theirs back: %d rows", rows())
	}

	// Unknown: refused, the six named; REST takes keys only.
	code, out := w.rest(w.writer, "PUT", base+"rocket", nil)
	if code != 400 || !strings.Contains(out, "unknown_reaction") || !strings.Contains(out, "thumbs_up") {
		t.Errorf("REST unknown reaction: %d %s", code, out)
	}
	if code, _ := w.rest(w.writer, "PUT", base+"%E2%9D%A4", nil); code != 400 {
		t.Errorf("REST took a glyph instead of a key: %d", code)
	}
	if _, err := w.mcp(t, w.writer, "write", map[string]string{"action": "react", "comment_id": id, "reaction": "rocket"}); err == nil || !strings.Contains(err.Error(), "check ✅") {
		t.Errorf("MCP unknown reaction: %v", err)
	}
	// A read-only member, and a read-only token, react on neither door.
	if code, _ := w.rest(w.viewer, "PUT", base+"tada", nil); code != 403 {
		t.Errorf("REST react by a read-only member: %d, want 403", code)
	}
	if _, err := w.mcp(t, w.writer, "read", map[string]string{"action": "react", "comment_id": id, "reaction": "tada"}); err == nil {
		t.Error("MCP react with a read-only token went through")
	}
	if rows() != 0 {
		t.Errorf("a refused reaction was stored: %d rows", rows())
	}
}

// Who may delete is the same on both doors (FR-009): the author or a
// workspace admin. A writer who is neither was let through over MCP.
func TestDeletingACommentIsForItsAuthorOrAnAdminOnBothDoors(t *testing.T) {
	w := newCommentWorld(t)
	del := func(t *testing.T, door, who, id string) bool {
		t.Helper()
		if door == "REST" {
			code, _ := w.rest(who, "DELETE", "/api/comments/"+id, nil)
			return code == 200
		}
		b, _ := json.Marshal(map[string]string{"comment_id": id})
		_, err := callTool(t, w.s, &user{ID: who, Name: "Agent", TokenScope: "write", TokenKind: tokenKindAPI}, "delete_comment", string(b))
		return err == nil
	}
	for _, door := range []string{"REST", "MCP"} {
		id := w.comment(t, "Delete me")
		if del(t, door, w.writer, id) {
			t.Errorf("%s: a writer who is neither author nor admin deleted the comment", door)
		}
		if del(t, door, w.viewer, id) {
			t.Errorf("%s: a read-only member deleted the comment", door)
		}
		if !del(t, door, w.admin, id) {
			t.Errorf("%s: the workspace admin could not delete the comment", door)
		}
		id = w.comment(t, "Delete me too")
		if !del(t, door, w.author, id) {
			t.Errorf("%s: the author could not delete their comment", door)
		}
	}
}

// Deleting a comment, or its page, takes its versions and reactions with it
// (the foreign keys of step 3): nothing is left pointing at a comment that is
// gone.
func TestACommentsVersionsAndReactionsGoWithIt(t *testing.T) {
	w := newCommentWorld(t)
	setup := func() string {
		id := w.comment(t, "One")
		w.rest(w.author, "PATCH", "/api/comments/"+id, map[string]string{"body": "Two"})
		w.rest(w.writer, "PUT", "/api/comments/"+id+"/reactions/eyes", nil)
		if w.count(t, `SELECT COUNT(*) FROM comment_versions WHERE comment_id = ?`, id) != 1 ||
			w.count(t, `SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ?`, id) != 1 {
			t.Fatal("setup: no version or no reaction stored")
		}
		return id
	}
	gone := func(id, how string) {
		t.Helper()
		if n := w.count(t, `SELECT COUNT(*) FROM comment_versions WHERE comment_id = ?`, id) +
			w.count(t, `SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ?`, id); n != 0 {
			t.Errorf("after %s, %d versions/reactions are left", how, n)
		}
	}
	id := setup()
	w.rest(w.author, "DELETE", "/api/comments/"+id, nil)
	gone(id, "deleting the comment")

	id = setup()
	if _, err := w.s.db.Exec(`DELETE FROM pages WHERE id = ?`, w.page); err != nil {
		t.Fatal(err)
	}
	gone(id, "deleting the page")
}
