package server

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"
)

// Comments: the list, adding, resolving, editing, earlier versions, reactions
// and deleting (spec 017). Every action that names a comment goes through one
// gate here, called by the REST handlers below and by the MCP comments and
// delete_comment tools alike. The two doors used to check for themselves, and
// drifted: delete_comment let anyone who could write on the page delete
// anybody's comment while the REST route allowed only its author or a
// workspace admin (FR-009), and an agent's comment skipped the length limit
// (#645).

// ---- Gates ----

// errCommentNotFound is the answer to a caller who may not see the comment's
// page: the same as for an id that does not exist, so comment ids cannot be
// probed.
var errCommentNotFound = errors.New("comment not found")

// errCommentEmpty is checkCommentBody's refusal of a comment with no text.
var errCommentEmpty = errors.New("comment body is required")

// commentRef is what a gate found out about the comment it let through.
type commentRef struct {
	ID, PageID, AuthorID, Body, Workspace string
}

func (s *Server) loadCommentRef(id string) (commentRef, bool) {
	c := commentRef{ID: id}
	if s.db.QueryRow(`SELECT page_id, author_id, body FROM comments WHERE id = ?`, id).
		Scan(&c.PageID, &c.AuthorID, &c.Body) != nil {
		return c, false
	}
	c.Workspace = s.pageWorkspace(c.PageID)
	return c, true
}

// commentForRead lets through anyone who may read the comment's page, with a
// credential allowed into its workspace: the list and earlier versions.
func (s *Server) commentForRead(u *user, id string) (commentRef, error) {
	c, ok := s.loadCommentRef(id)
	if !ok || !s.canRead(u.ID, c.PageID) || !s.credentialMayEnter(u, c.Workspace) {
		return c, errCommentNotFound
	}
	return c, nil
}

// commentForWrite lets through anyone who may write on the comment's page:
// resolve, reopen, react and unreact.
func (s *Server) commentForWrite(u *user, id string) (commentRef, error) {
	c, err := s.commentForRead(u, id)
	if err != nil {
		return c, err
	}
	if !s.canWrite(u.ID, c.PageID) {
		return c, coded("forbidden", "You may not write on this page.")
	}
	return c, nil
}

// commentForEdit is commentForWrite plus authorship: only the person who wrote
// a comment may change what it says (FR-001). Not a workspace admin either —
// an admin may delete a comment, never put words in someone's mouth.
func (s *Server) commentForEdit(u *user, id string) (commentRef, error) {
	c, err := s.commentForWrite(u, id)
	if err != nil {
		return c, err
	}
	if c.AuthorID != u.ID {
		return c, coded("comment_not_author", "Only its author can edit a comment.")
	}
	return c, nil
}

// commentForDelete is the rule the REST route always had, now on both doors
// (FR-009): its author, or an admin of the page's workspace. The credential
// has to be allowed into that workspace first: the request names a comment,
// not a page, so no page check covers it.
func (s *Server) commentForDelete(u *user, id string) (commentRef, error) {
	c, ok := s.loadCommentRef(id)
	if !ok || !s.credentialMayEnter(u, c.Workspace) {
		return c, errCommentNotFound
	}
	if c.AuthorID != u.ID && !s.isWorkspaceAdmin(u.ID, c.Workspace) {
		return c, coded("forbidden", "Only its author or a workspace admin can delete a comment.")
	}
	return c, nil
}

// commentGateError writes a gate's refusal out over REST: 404 for a comment
// the caller may not see, 403 with the reason otherwise.
func commentGateError(w http.ResponseWriter, err error) {
	if errors.Is(err, errCommentNotFound) {
		httpError(w, 404, "comment not found")
		return
	}
	httpErrorFrom(w, 403, err)
}

// mcpCommentError is the same refusal over MCP, naming the id the agent sent.
func mcpCommentError(id string, err error) error {
	if errors.Is(err, errCommentNotFound) {
		return fmt.Errorf("comment %q not found", id)
	}
	return err
}

// checkCommentBody is the one check a comment's text passes before it is
// stored, on add and on edit, by the REST routes and the MCP comments tool
// alike. It returns the text as stored (trimmed). The length check lived only
// on the REST side, so an agent could store a comment of any length that then
// landed in every list of the page's comments (#645).
func checkCommentBody(body string) (string, error) {
	text := strings.TrimSpace(body)
	if text == "" {
		return "", errCommentEmpty
	}
	// Counted after trimming: the whitespace around a comment is never stored,
	// so it does not count against the limit either.
	if utf8.RuneCountInString(text) > maxCommentLen {
		return "", coded("comment_too_long", fmt.Sprintf("A comment is limited to %d characters.", maxCommentLen))
	}
	return text, nil
}

// ---- Reactions ----

// commentReactions is the fixed set a person may react with (spec 017 R2), in
// the order the picker shows them. Stored and sent by key, not glyph: an emoji
// is not one fixed string (❤ with or without its variation selector), so a
// glyph as a key would let one reaction be stored twice. The browser's copy is
// COMMENT_REACTIONS in web/src/commentReactions.ts; check-comment-reactions.mjs
// keeps the two equal.
var commentReactions = []struct{ Key, Glyph string }{
	{"thumbs_up", "👍"},
	{"heart", "❤️"},
	{"tada", "🎉"},
	{"smile", "😄"},
	{"eyes", "👀"},
	{"check", "✅"},
}

// reactionKeys lists the keys for an error message an agent can act on.
func reactionKeys() string {
	keys := make([]string, len(commentReactions))
	for i, r := range commentReactions {
		keys[i] = r.Key + " " + r.Glyph
	}
	return strings.Join(keys, ", ")
}

// parseReaction turns what a caller sent into a reaction key. REST takes the
// key only; MCP also takes the glyph, with or without the variation selector
// (U+FE0F), because that is what an agent naturally writes.
func parseReaction(in string, glyphToo bool) (string, error) {
	in = strings.TrimSpace(in)
	for _, r := range commentReactions {
		if in == r.Key {
			return r.Key, nil
		}
		if glyphToo && strings.TrimSuffix(in, "️") == strings.TrimSuffix(r.Glyph, "️") {
			return r.Key, nil
		}
	}
	return "", coded("unknown_reaction", "Unknown reaction; use one of: "+reactionKeys()+".")
}

// setReaction adds the person's reaction; reacting twice changes nothing
// (the primary key, FR-005). Reactions are not written to the activity log:
// they are acknowledgements, not changes (spec 017, R7).
func (s *Server) setReaction(u *user, commentID, key string) error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO comment_reactions (comment_id, user_id, user_name, reaction, created_at) VALUES (?, ?, ?, ?, ?)`,
		commentID, u.ID, u.Name, key, now())
	return err
}

// removeReaction takes the person's own reaction back; never anybody else's.
func (s *Server) removeReaction(u *user, commentID, key string) error {
	_, err := s.db.Exec(`DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND reaction = ?`,
		commentID, u.ID, key)
	return err
}

// ---- Editing ----

// editComment replaces the text of a comment the gate let through and keeps
// the text it replaces (FR-003). The same text changes nothing: no version, no
// "(edited)", no log entry (FR-004). Returns whether it changed.
func (s *Server) editComment(c commentRef, u *user, actorType, actorName, body string) (bool, error) {
	text, err := checkCommentBody(body)
	if err != nil {
		return false, err
	}
	if text == c.Body {
		return false, nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	at := now()
	// The old text is copied inside the transaction, from the row itself, not
	// from what the gate read: an edit between the two would otherwise lose
	// that version.
	if _, err := tx.Exec(`INSERT INTO comment_versions (id, comment_id, body, replaced_at) SELECT ?, id, body, ? FROM comments WHERE id = ?`,
		newID(), at, c.ID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(`UPDATE comments SET body = ?, edited_at = ? WHERE id = ?`, text, at, c.ID); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	s.audit(actorType, u.ID, actorName, "comment.edit", c.PageID, c.Workspace, c.ID)
	return true, nil
}

type commentVersionJSON struct {
	Body string `json:"body"`
	// When this text stopped being the comment's: the time of the edit that
	// replaced it.
	ReplacedAt string `json:"replacedAt"`
}

// commentVersions is every earlier text of a comment, newest first. Loaded on
// request only, never with the list.
func (s *Server) commentVersions(commentID string) ([]commentVersionJSON, error) {
	rows, err := s.db.Query(`SELECT body, replaced_at FROM comment_versions WHERE comment_id = ? ORDER BY replaced_at DESC, rowid DESC`, commentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []commentVersionJSON{}
	for rows.Next() {
		var v commentVersionJSON
		if err := rows.Scan(&v.Body, &v.ReplacedAt); err != nil {
			return nil, err
		}
		list = append(list, v)
	}
	return list, rows.Err()
}

// ---- The list ----

type commentJSON struct {
	ID         string  `json:"id"`
	BlockID    string  `json:"blockId"`
	AuthorID   string  `json:"authorId"`
	AuthorName string  `json:"authorName"`
	Body       string  `json:"body"`
	CreatedAt  string  `json:"createdAt"`
	ResolvedAt *string `json:"resolvedAt"`
	// Set once the author edited it; the earlier texts are behind
	// GET /api/comments/{id}/versions.
	EditedAt *string `json:"editedAt"`
	// The author's colour/picture, so the same person looks the same
	// everywhere — the comment column used to roll a colour out of the name
	// that had nothing to do with the real user colour.
	AuthorColor  string         `json:"authorColor"`
	AuthorAvatar string         `json:"authorAvatar"`
	Reactions    []reactionJSON `json:"reactions"`
}

type reactionUser struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type reactionJSON struct {
	Reaction string         `json:"reaction"`
	Count    int            `json:"count"`
	Users    []reactionUser `json:"users"`
	// Whether the person asking reacted with it, so the chip shows pressed.
	Mine bool `json:"mine"`
}

// pageComments lists a page's comments with their reactions, for viewerID
// (empty: nobody's reactions are "mine"). Two queries, each drained before the
// next (one writer connection), joined here: the reactions' lookup uses the
// comments' page index and then their own primary key (spec 017, R5).
func (s *Server) pageComments(pageID, viewerID string) ([]commentJSON, error) {
	// LEFT JOIN: the author may be deleted — the comment stays.
	rows, err := s.db.Query(`SELECT c.id, c.block_id, c.author_id, c.author_name, c.body, c.created_at, c.resolved_at, c.edited_at,
		COALESCE(u.color, ''), COALESCE(u.avatar, '')
		FROM comments c LEFT JOIN users u ON u.id = c.author_id
		WHERE c.page_id = ? ORDER BY c.created_at`, pageID)
	if err != nil {
		return nil, err
	}
	list := []commentJSON{}
	index := map[string]int{}
	for rows.Next() {
		var c commentJSON
		var resolved, edited sql.NullString
		if err := rows.Scan(&c.ID, &c.BlockID, &c.AuthorID, &c.AuthorName, &c.Body, &c.CreatedAt, &resolved, &edited, &c.AuthorColor, &c.AuthorAvatar); err != nil {
			rows.Close()
			return nil, err
		}
		if resolved.Valid {
			c.ResolvedAt = &resolved.String
		}
		if edited.Valid {
			c.EditedAt = &edited.String
		}
		c.Reactions = []reactionJSON{}
		index[c.ID] = len(list)
		list = append(list, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return list, nil
	}

	rrows, err := s.db.Query(`SELECT r.comment_id, r.reaction, r.user_id, r.user_name
		FROM comments c JOIN comment_reactions r ON r.comment_id = c.id
		WHERE c.page_id = ? ORDER BY r.created_at`, pageID)
	if err != nil {
		return nil, err
	}
	type hit struct{ comment, reaction, userID, userName string }
	var hits []hit
	for rrows.Next() {
		var h hit
		if err := rrows.Scan(&h.comment, &h.reaction, &h.userID, &h.userName); err != nil {
			rrows.Close()
			return nil, err
		}
		hits = append(hits, h)
	}
	rrows.Close()
	if err := rrows.Err(); err != nil {
		return nil, err
	}
	// Grouped per comment in the picker's order, so the chips stand in the
	// same order on every comment.
	byComment := map[string]map[string]*reactionJSON{}
	for _, h := range hits {
		m := byComment[h.comment]
		if m == nil {
			m = map[string]*reactionJSON{}
			byComment[h.comment] = m
		}
		r := m[h.reaction]
		if r == nil {
			r = &reactionJSON{Reaction: h.reaction, Users: []reactionUser{}}
			m[h.reaction] = r
		}
		r.Count++
		r.Users = append(r.Users, reactionUser{ID: h.userID, Name: h.userName})
		if viewerID != "" && h.userID == viewerID {
			r.Mine = true
		}
	}
	for id, m := range byComment {
		i, ok := index[id]
		if !ok {
			continue
		}
		for _, cr := range commentReactions {
			if r := m[cr.Key]; r != nil {
				list[i].Reactions = append(list[i].Reactions, *r)
			}
		}
	}
	return list, nil
}

// ---- REST ----

func (s *Server) handleListComments(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("id")
	if !s.canReadReq(r, pageID) {
		httpError(w, 404, "page not found")
		return
	}
	list, err := s.pageComments(pageID, requestUser(r).ID)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, list)
}

func (s *Server) handleCreateComment(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("id")
	u := requestUser(r)
	if !s.canWriteReq(r, pageID) {
		httpError(w, 403, "forbidden")
		return
	}
	var body struct {
		Body    string `json:"body"`
		BlockID string `json:"blockId"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	text, err := checkCommentBody(body.Body)
	if err != nil {
		httpErrorFrom(w, 400, err)
		return
	}
	id := newID()
	if _, err := s.db.Exec(`INSERT INTO comments (id, page_id, block_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, pageID, body.BlockID, u.ID, u.Name, text, now()); err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]string{"id": id})
}

// handleResolveComment toggles a comment's resolved state.
func (s *Server) handleResolveComment(w http.ResponseWriter, r *http.Request) {
	c, err := s.commentForWrite(requestUser(r), r.PathValue("id"))
	if err != nil {
		commentGateError(w, err)
		return
	}
	var body struct {
		Resolved bool `json:"resolved"`
	}
	decodeJSON(w, r, &body)
	var resolvedAt any
	if body.Resolved {
		resolvedAt = now()
	}
	s.db.Exec(`UPDATE comments SET resolved_at = ? WHERE id = ?`, resolvedAt, c.ID)
	writeJSON(w, map[string]bool{"ok": true})
}

// handleEditComment is PATCH /api/comments/{id}: the author changes the text.
func (s *Server) handleEditComment(w http.ResponseWriter, r *http.Request) {
	u := requestUser(r)
	c, err := s.commentForEdit(u, r.PathValue("id"))
	if err != nil {
		commentGateError(w, err)
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	actor := "human"
	if u.TokenScope != "" {
		actor = "agent"
	}
	changed, err := s.editComment(c, u, actor, u.Name, body.Body)
	if err != nil {
		var ce *codedError
		if errors.As(err, &ce) || errors.Is(err, errCommentEmpty) {
			httpErrorFrom(w, 400, err)
			return
		}
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]bool{"ok": true, "changed": changed})
}

// handleCommentVersions is GET /api/comments/{id}/versions: every earlier
// text, for anyone who may read the page (FR-003).
func (s *Server) handleCommentVersions(w http.ResponseWriter, r *http.Request) {
	c, err := s.commentForRead(requestUser(r), r.PathValue("id"))
	if err != nil {
		commentGateError(w, err)
		return
	}
	list, err := s.commentVersions(c.ID)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, list)
}

// handleSetReaction is PUT /api/comments/{id}/reactions/{reaction}, and with
// DELETE its undo. PUT and DELETE rather than a toggle: a retried request
// lands in the same state instead of undoing itself.
func (s *Server) handleSetReaction(w http.ResponseWriter, r *http.Request) {
	u := requestUser(r)
	c, err := s.commentForWrite(u, r.PathValue("id"))
	if err != nil {
		commentGateError(w, err)
		return
	}
	key, err := parseReaction(r.PathValue("reaction"), false)
	if err != nil {
		httpErrorFrom(w, 400, err)
		return
	}
	if r.Method == http.MethodDelete {
		err = s.removeReaction(u, c.ID, key)
	} else {
		err = s.setReaction(u, c.ID, key)
	}
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteComment(w http.ResponseWriter, r *http.Request) {
	c, err := s.commentForDelete(requestUser(r), r.PathValue("id"))
	if err != nil {
		commentGateError(w, err)
		return
	}
	s.db.Exec(`DELETE FROM comments WHERE id = ?`, c.ID)
	writeJSON(w, map[string]bool{"ok": true})
}
