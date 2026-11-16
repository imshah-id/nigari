package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Page version history and comments (Welle 13).
//
// The CRDT update log is compacted away, so version history is a SEPARATE,
// materialized snapshot store: whenever a page's content is written (editor
// materialize, API/MCP), we record a throttled snapshot so a user can browse
// and restore prior versions. Comments live in their own table, page- or
// block-scoped, resolvable, and reachable by agents via MCP.

const revisionThrottle = 2 * time.Minute // at most one snapshot per page per window
const revisionKeep = 50                  // keep the newest N per page

// snapshotRevision records the page's current title+content as a revision,
// unless the newest revision is younger than revisionThrottle. Best-effort:
// history is a convenience, never blocks the write path.
func (s *Server) snapshotRevision(pageID, authorID, authorName string) {
	var last string
	if s.db.QueryRow(`SELECT created_at FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC LIMIT 1`, pageID).Scan(&last) == nil {
		if t, err := time.Parse(time.RFC3339Nano, last); err == nil && time.Since(t) < revisionThrottle {
			return
		}
	}
	s.snapshotRevisionNow(pageID, authorID, authorName)
}

// snapshotRevisionNow is snapshotRevision without the throttle, for a write
// whose "before" must be restorable however soon it follows the last one: a
// find-and-replace edit (cap_edits.go) a minute after another would otherwise
// leave the state between them in no revision.
func (s *Server) snapshotRevisionNow(pageID, authorID, authorName string) {
	var title, content string
	if s.db.QueryRow(`SELECT title, content FROM pages WHERE id = ?`, pageID).Scan(&title, &content) != nil {
		return
	}
	if strings.TrimSpace(content) == "" || content == "[]" {
		return // don't snapshot an empty doc
	}
	s.db.Exec(`INSERT INTO page_revisions (id, page_id, created_at, author_id, author_name, title, content) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newID(), pageID, now(), authorID, authorName, title, content)
	// Prune to the newest revisionKeep for this page.
	s.db.Exec(`DELETE FROM page_revisions WHERE page_id = ? AND id NOT IN (
		SELECT id FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC LIMIT ?)`, pageID, pageID, revisionKeep)
}

type revisionJSON struct {
	ID         string `json:"id"`
	CreatedAt  string `json:"createdAt"`
	AuthorName string `json:"authorName"`
	Title      string `json:"title"`
}

func (s *Server) handleListRevisions(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("id")
	if !s.canReadReq(r, pageID) {
		httpError(w, 404, "page not found")
		return
	}
	rows, err := s.db.Query(`SELECT id, created_at, author_name, title FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC`, pageID)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	list := []revisionJSON{}
	for rows.Next() {
		var x revisionJSON
		rows.Scan(&x.ID, &x.CreatedAt, &x.AuthorName, &x.Title)
		list = append(list, x)
	}
	writeJSON(w, list)
}

// handleGetRevision returns a single revision's full content.
func (s *Server) handleGetRevision(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("id")
	if !s.canReadReq(r, pageID) {
		httpError(w, 404, "page not found")
		return
	}
	var title, content, createdAt, author string
	err := s.db.QueryRow(`SELECT title, content, created_at, author_name FROM page_revisions WHERE id = ? AND page_id = ?`, r.PathValue("revId"), pageID).Scan(&title, &content, &createdAt, &author)
	if err == sql.ErrNoRows {
		httpError(w, 404, "revision not found")
		return
	}
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]any{
		"title": title, "content": json.RawMessage(content), "createdAt": createdAt, "authorName": author,
	})
}

// handleRestoreRevision snapshots the current state (so the restore is itself
// undoable) then overwrites the page's content with the chosen revision and
// resets the live CRDT doc so open editors reload.
func (s *Server) handleRestoreRevision(w http.ResponseWriter, r *http.Request) {
	pageID := r.PathValue("id")
	u := requestUser(r)
	if !s.canWriteReq(r, pageID) {
		httpError(w, 403, "forbidden")
		return
	}
	var content string
	err := s.db.QueryRow(`SELECT content FROM page_revisions WHERE id = ? AND page_id = ?`, r.PathValue("revId"), pageID).Scan(&content)
	if err == sql.ErrNoRows {
		httpError(w, 404, "revision not found")
		return
	}
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	// Capture the pre-restore state first so a restore can be undone.
	s.snapshotRevision(pageID, u.ID, u.Name)
	if _, err := s.db.Exec(`UPDATE pages SET content = ?, updated_at = ?, `+bumpDocGen+` WHERE id = ?`, content, now(), pageID); err != nil {
		httpError(w, 500, err.Error())
		return
	}
	s.reindexPage(pageID)
	s.resetYjsDoc(pageID)
	s.pagesChanged()
	writeJSON(w, map[string]bool{"ok": true})
}

// ---- Comments: the handlers, gates and list are in comments.go ----

// handleCommentCounts returns the number of OPEN comments per page of a
// workspace, in one go.
//
// Why its own endpoint and not a column in pageMetaCols: the page list is the
// hottest path in the whole application and is loaded on every navigation — a
// JOIN over comments would hang off it permanently, even though the number
// interests only two views (board and page header). Resolved ones do not
// count: a ticked-off thread is no longer an open task, and a counter that
// never goes down gets ignored.
func (s *Server) handleCommentCounts(w http.ResponseWriter, r *http.Request) {
	userID := requestUser(r).ID
	ws := r.URL.Query().Get("workspaceId")
	if ws == "" || !s.isMember(userID, ws) || !s.tokenReachesWorkspace(r, ws) {
		httpError(w, 404, "workspace not found")
		return
	}
	rows, err := s.db.Query(`SELECT c.page_id, COUNT(*) FROM comments c
		JOIN pages p ON p.id = c.page_id
		WHERE p.workspace_id = ? AND p.trashed_at IS NULL AND c.resolved_at IS NULL
		GROUP BY c.page_id`, ws)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	type row struct {
		id string
		n  int
	}
	var list []row
	for rows.Next() {
		var it row
		if err := rows.Scan(&it.id, &it.n); err != nil {
			rows.Close()
			httpError(w, 500, err.Error())
			return
		}
		list = append(list, it)
	}
	rows.Close() // drain first — a single DB connection

	out := map[string]int{}
	for _, it := range list {
		// Other people's private pages must not give themselves away through a counter.
		if s.canRead(userID, it.id) {
			out[it.id] = it.n
		}
	}
	writeJSON(w, out)
}
