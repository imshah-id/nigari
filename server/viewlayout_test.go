package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Spec 018: a view's layout can be changed. The defaults a new layout gets
// come from one rule per side, held level by testdata/viewlayout/cases.json;
// the doors that already save views take the type; and the settings of the
// type a view leaves are kept for when it comes back.

type layoutCases struct {
	Schemas map[string][]map[string]any `json:"schemas"`
	Cases   []struct {
		Name      string         `json:"name"`
		Schema    string         `json:"schema"`
		View      map[string]any `json:"view"`
		Type      string         `json:"type"`
		Want      map[string]any `json:"want"`
		NeedsDate bool           `json:"needsDate"`
	} `json:"cases"`
}

// The browser's switchLayout answers the same cases (check-viewlayout.mjs),
// so the interface and set_view give a switched view the same defaults.
func TestViewLayoutCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "viewlayout", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var lc layoutCases
	if err := json.Unmarshal(raw, &lc); err != nil {
		t.Fatal(err)
	}
	if len(lc.Cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range lc.Cases {
		schema, ok := lc.Schemas[c.Schema]
		if !ok {
			t.Fatalf("%s: no schema %q", c.Name, c.Schema)
		}
		before, _ := json.Marshal(c.View)
		got, needsDate := switchViewLayout(c.View, c.Type, schema)
		gotJSON, _ := json.Marshal(got)
		wantJSON, _ := json.Marshal(c.Want)
		if string(gotJSON) != string(wantJSON) {
			t.Errorf("%s:\n got  %s\n want %s", c.Name, gotJSON, wantJSON)
		}
		if needsDate != c.NeedsDate {
			t.Errorf("%s: needsDate %v, want %v", c.Name, needsDate, c.NeedsDate)
		}
		if after, _ := json.Marshal(c.View); string(after) != string(before) {
			t.Errorf("%s: the view passed in was changed", c.Name)
		}
	}
}

// layoutFixture is a database with a table that carries settings of every
// kind, a board and a form.
func layoutFixture(t *testing.T) (lockFixture, string) {
	t.Helper()
	f := newLockFixture(t)
	views := `[{"id":"t","name":"Work","type":"table","filters":[{"property":"status","op":"is","value":"open"}],"sort":{"property":"due","dir":"asc"},"hidden":["system"],"colWidths":{"__title":300},"colOrder":["due","status"],"openIn":"side_peek"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`
	// A person property besides the fixture's own, for a board's lanes.
	if _, err := f.s.db.Exec(`UPDATE collections SET views = ?, schema = json_insert(schema, '$[#]', json('{"id":"owner","name":"Owner","type":"person"}')) WHERE page_id = ?`, views, f.col); err != nil {
		t.Fatal(err)
	}
	return f, views
}

func viewOf(t *testing.T, f lockFixture, id string) map[string]any {
	t.Helper()
	var raw string
	f.s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, f.col).Scan(&raw)
	var views []map[string]any
	_ = json.Unmarshal([]byte(raw), &views)
	for _, v := range views {
		if v["id"] == id {
			return v
		}
	}
	t.Fatalf("no view %q in %s", id, raw)
	return nil
}

// set_view takes a type on an existing view: the defaults are filled, every
// other setting is kept, an argument in the same call wins over a default,
// and the answer names what was chosen. Table → board → table over set_view
// gives back the stored table byte for byte (SC-002).
func TestSetViewChangesALayout(t *testing.T) {
	f, _ := layoutFixture(t)
	before, _ := json.Marshal(viewOf(t, f, "t"))

	out, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","type":"board"}`)
	if err != nil {
		t.Fatalf("to a board: %v", err)
	}
	if !strings.Contains(out, `now a board, grouped by "Status"`) {
		t.Errorf("the answer does not name the grouping: %s", out)
	}
	board := viewOf(t, f, "t")
	if board["type"] != "board" || board["groupBy"] != "status" || board["openIn"] != "side_peek" || board["colWidths"] == nil || board["sort"] == nil {
		t.Errorf("the board lost a setting or got no grouping: %v", board)
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","type":"table"}`); err != nil {
		t.Fatalf("back to a table: %v", err)
	}
	back := viewOf(t, f, "t")
	delete(back, "groupBy") // the board's grouping stays, unused (FR-003)
	if got, _ := json.Marshal(back); string(got) != string(before) {
		t.Errorf("table → board → table changed the table:\n before %s\n after  %s", before, got)
	}

	// An argument in the same call wins over the default.
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","type":"calendar","date_prop":"due"}`); err != nil {
		t.Fatalf("to a calendar with date_prop: %v", err)
	}
	if v := viewOf(t, f, "t"); v["type"] != "calendar" || v["dateProp"] != "due" {
		t.Errorf("calendar: %v", v)
	}

	// The change is logged as a view change.
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'view.update'`).Scan(&n)
	if n < 3 {
		t.Errorf("%d view.update entries for three layout changes", n)
	}
}

// What set_view refuses: an unknown type, a calendar on a database with no
// date (with update_schema named), a read-only token; none of them change
// anything.
func TestSetViewRefusesALayoutItCannotMake(t *testing.T) {
	f, stored := layoutFixture(t)
	if _, err := f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`,
		`[{"id":"status","name":"Status","type":"select","options":[{"id":"open","name":"Open"}]},{"id":"system","name":"System","type":"text"}]`, f.col); err != nil {
		t.Fatal(err)
	}
	for args, want := range map[string]string{
		`"type":"kanban"`:   "unknown view type",
		`"type":"calendar"`: "update_schema",
		`"type":"timeline"`: "no date property",
	} {
		_, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t",`+args+`}`)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v, want %q", args, err, want)
		}
	}
	reader := &user{ID: f.owner, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, f.s, reader, "set_view", `{"page_id":"`+f.col+`","view_id":"t","type":"list"}`); err == nil {
		t.Error("a read-only token changed a layout")
	}
	var now string
	f.s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, f.col).Scan(&now)
	if now != stored {
		t.Errorf("a refused change was stored:\n%s", now)
	}
}

// The REST views save applies the same type rule (FR-010): an unknown type is
// refused with invalid_view_type when it is new or changed, and a view stored
// with an odd type long ago does not block an unrelated save. A board's lanes
// survive its time as a table (the spec's edge case).
func TestTheViewsSaveChecksTheType(t *testing.T) {
	f, _ := layoutFixture(t)
	put := func(views string) (int, string) {
		rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col, `{"views":`+views+`}`)
		return rec.Code, rec.Body.String()
	}
	if code, body := put(`[{"id":"t","name":"Work","type":"kanban"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`); code != 400 || !strings.Contains(body, "invalid_view_type") {
		t.Errorf("unknown type: %d %s, want 400 invalid_view_type", code, body)
	}
	if code, body := put(`[{"id":"n","name":"New","type":""}]`); code != 400 || !strings.Contains(body, "invalid_view_type") {
		t.Errorf("a new view with no type: %d %s, want 400", code, body)
	}
	// Stored long ago with an odd type: another view's change still saves.
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[{"id":"old","name":"Old","type":"mystery"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`, f.col)
	if code, body := put(`[{"id":"old","name":"Old","type":"mystery"},{"id":"b","name":"Renamed","type":"board","groupBy":"status"}]`); code != 200 {
		t.Errorf("an unrelated save next to an old odd type: %d %s", code, body)
	}

	// Lanes: board → table keeps subGroupBy, table → board shows it again.
	if code, body := put(`[{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"owner"}]`); code != 200 {
		t.Fatalf("board with lanes: %d %s", code, body)
	}
	if code, body := put(`[{"id":"b","name":"Board","type":"table","groupBy":"status","subGroupBy":"owner"}]`); code != 200 {
		t.Fatalf("to a table: %d %s", code, body)
	}
	if v := viewOf(t, f, "b"); v["subGroupBy"] != "owner" {
		t.Errorf("the lanes were dropped when the board became a table: %v", v)
	}
	// Setting lanes on a table that never had them is still refused.
	if code, _ := put(`[{"id":"b","name":"Board","type":"table","groupBy":"status"}]`); code != 200 {
		t.Fatal("dropping the lanes")
	}
	if code, _ := put(`[{"id":"b","name":"Board","type":"table","groupBy":"status","subGroupBy":"owner"}]`); code != 400 {
		t.Errorf("new lanes on a table: %d, want 400", code)
	}
}

// An embed's view changes layout in the document only; a form is refused
// there with the embed's own sentence, and the database's views are not
// touched.
func TestSetViewChangesAnEmbedsLayout(t *testing.T) {
	f := newEmbedFixture(t)
	before := f.dbViews(t)
	out, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","view_id":"all","type":"board"}`)
	if err != nil {
		t.Fatalf("embed view to a board: %v", err)
	}
	if !strings.Contains(out, "grouped by") {
		t.Errorf("the answer does not name the grouping: %s", out)
	}
	found := false
	for _, v := range f.embedViews(t) {
		if v["id"] == "all" {
			found = true
			if v["type"] != "board" || v["groupBy"] != "status" || v["filters"] == nil {
				t.Errorf("the embed's view: %v", v)
			}
		}
	}
	if !found {
		t.Error("the embed's view is gone")
	}
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","view_id":"all","type":"form"}`); err == nil || !strings.Contains(err.Error(), "stays on the database") {
		t.Errorf("a form in an embed: %v", err)
	}
	if after := f.dbViews(t); after != before {
		t.Errorf("changing an embed's layout changed the database's views:\n%s\n%s", before, after)
	}
}
