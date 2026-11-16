package server

import (
	"database/sql"
	"strings"
	"testing"
)

// Step 3 (spec 017) on a database written by the code just before it
// (step-2.db): comments gain edited_at, the versions and reactions tables
// appear, the comments already stored come through unchanged and unedited,
// and a second start finds nothing to do.
func TestUpgradeStepThreeAddsCommentEditsAndReactions(t *testing.T) {
	path := copyFixture(t, "step-2.db")
	if got := stepOf(t, path); got != 2 {
		t.Fatalf("step-2.db is at step %d, want 2", got)
	}
	read := func(q string) []string {
		t.Helper()
		db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		rows, err := db.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		return out
	}
	const commentsQ = `SELECT id || '|' || page_id || '|' || author_id || '|' || body || '|' || created_at FROM comments ORDER BY id`
	before := read(commentsQ)
	if len(before) == 0 {
		t.Fatal("step-2.db has no comment to carry through the step")
	}

	stepsToThree := upgradeSteps()[:3]
	ran, err := upgradeWith(path, stepsToThree)
	if err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if len(ran) != 1 || ran[0] != 3 {
		t.Fatalf("steps run: %v, want [3]", ran)
	}
	shape := dbShape(t, path)
	for _, want := range []string{
		"column comments.edited_at TEXT notnull=0",
		"table comment_versions: CREATE TABLE comment_versions ( id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE, body TEXT NOT NULL, replaced_at TEXT NOT NULL )",
		"index comment_versions_comment: CREATE INDEX comment_versions_comment ON comment_versions(comment_id, replaced_at)",
		"table comment_reactions: CREATE TABLE comment_reactions ( comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE, user_id TEXT NOT NULL, user_name TEXT NOT NULL, reaction TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (comment_id, user_id, reaction) )",
	} {
		if !strings.Contains(shape, want) {
			t.Errorf("after step 3 the database lacks %q", want)
		}
	}
	if got := read(commentsQ); strings.Join(got, "\n") != strings.Join(before, "\n") {
		t.Errorf("step 3 changed the comments:\nbefore %v\nafter  %v", before, got)
	}
	if got := read(`SELECT id FROM comments WHERE edited_at IS NOT NULL`); len(got) != 0 {
		t.Errorf("comments came out of step 3 marked edited: %v", got)
	}

	ran, err = upgradeWith(path, stepsToThree)
	if err != nil {
		t.Fatalf("second start: %v", err)
	}
	if len(ran) != 0 {
		t.Errorf("a second start ran steps %v, want none", ran)
	}
	if again := dbShape(t, path); again != shape {
		t.Errorf("a second start changed the database:\n%s", lineDiff(shape, again))
	}
}
