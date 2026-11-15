package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Spec 016: the status property. One function prepares a status on every
// door that writes a schema (R9): PUT /api/collections/{id}, update_schema
// and create_database. These tests go through each door, so a door that
// stops calling it fails here.

// The conversion's guess against the cases the browser's guess is checked
// against too (check-statusgroups.mjs): one file, two languages, no drift.
func TestStatusGroupGuessFollowsTheSharedCases(t *testing.T) {
	raw, err := os.ReadFile("testdata/statusgroups.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases [][2]string `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Cases) == 0 {
		t.Fatal("no cases in testdata/statusgroups.json")
	}
	for _, c := range file.Cases {
		if got := guessStatusGroup(c[0]); got != c[1] {
			t.Errorf("guessStatusGroup(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

type statusDoors struct {
	s      *Server
	u      *user
	cookie string
	ws     string
	uid    string
}

func newStatusDoors(t *testing.T) statusDoors {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "status@example.test")
	return statusDoors{s: s, u: &user{ID: uid, Name: "Test"}, cookie: cookie, ws: s.firstWorkspaceOf(t, uid), uid: uid}
}

func (d statusDoors) schemaOf(t *testing.T, id string) []map[string]any {
	t.Helper()
	schema, _, err := d.s.loadCollection(id)
	if err != nil {
		t.Fatalf("load %s: %v", id, err)
	}
	return schema
}

// putSchema saves a whole schema the way the interface does.
func (d statusDoors) putSchema(t *testing.T, id, schema string) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/collections/"+id, strings.NewReader(`{"schema":`+schema+`}`))
	req.Header.Set("Cookie", d.cookie)
	req.Header.Set("Content-Type", "application/json")
	d.s.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func (d statusDoors) updateSchema(t *testing.T, id, props string) error {
	t.Helper()
	_, err := callTool(t, d.s, d.u, "update_schema", `{"page_id":"`+id+`","properties":`+props+`}`)
	return err
}

func (d statusDoors) createDatabase(t *testing.T, title, schema string) (string, error) {
	t.Helper()
	_, err := callTool(t, d.s, d.u, "create_database", `{"title":"`+title+`","workspace_id":"`+d.ws+`","schema":`+schema+`}`)
	if err != nil {
		return "", err
	}
	var id string
	d.s.db.QueryRow(`SELECT id FROM pages WHERE title = ? AND type = 'collection'`, title).Scan(&id)
	return id, nil
}

func optionGroups(t *testing.T, schema []map[string]any, propID string) (ids, groups []string) {
	t.Helper()
	for _, p := range schema {
		if p["id"] != propID {
			continue
		}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m := o.(map[string]any)
			id, _ := m["id"].(string)
			g, _ := m["group"].(string)
			ids = append(ids, id)
			groups = append(groups, g)
		}
		return
	}
	t.Fatalf("no property %q", propID)
	return
}

// What a door may not store: each refused on all three doors, and nothing of
// it reaches the database.
func TestStatusRefusalsOnEveryDoor(t *testing.T) {
	cases := []struct {
		name, options, says string
	}{
		{"unknown group", `[{"id":"a","name":"A","group":"todo"},{"id":"b","name":"B","group":"in_progress"},{"id":"c","name":"C","group":"later"}]`, `"later`},
		{"empty group", `[{"id":"a","name":"A","group":"todo"},{"id":"c","name":"C","group":"complete"}]`, "In progress group"},
		{"duplicate name", `[{"id":"a","name":"Open","group":"todo"},{"id":"b","name":"open","group":"in_progress"},{"id":"c","name":"C","group":"complete"}]`, "two options named"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := newStatusDoors(t)
			prop := `{"id":"stage","name":"Stage","type":"status","options":` + c.options + `}`
			col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[]`)

			code, body := d.putSchema(t, col, `[`+prop+`]`)
			if code != 400 || !strings.Contains(body, "invalid_status_options") || !strings.Contains(body, c.says) {
				t.Errorf("REST: %d %s, want 400 invalid_status_options saying %q", code, body, c.says)
			}
			if err := d.updateSchema(t, col, `[`+prop+`]`); err == nil || !strings.Contains(err.Error(), c.says) {
				t.Errorf("update_schema: %v, want a refusal saying %q", err, c.says)
			}
			if len(d.schemaOf(t, col)) != 0 {
				t.Errorf("a refused status was stored: %v", d.schemaOf(t, col))
			}
			if _, err := d.createDatabase(t, "Refused", `[`+prop+`]`); err == nil || !strings.Contains(err.Error(), c.says) {
				t.Errorf("create_database: %v, want a refusal saying %q", err, c.says)
			}
			var n int
			d.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE title = 'Refused'`).Scan(&n)
			if n != 0 {
				t.Error("create_database made a database with a refused status")
			}
		})
	}
}

// Options are stored in group order, their order within a group kept (R2),
// on every door.
func TestStatusOptionsAreKeptInGroupOrder(t *testing.T) {
	d := newStatusDoors(t)
	prop := `{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"shipped","name":"Shipped","group":"complete"},
		{"id":"idea","name":"Idea","group":"todo"},
		{"id":"build","name":"Build","group":"in_progress"},
		{"id":"next","name":"Next","group":"todo"}]}`
	want := "idea,next,build,shipped"

	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[]`)
	if code, body := d.putSchema(t, col, `[`+prop+`]`); code != 200 {
		t.Fatalf("REST: %d %s", code, body)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("REST stored %v, want %s", ids, want)
	}

	col2 := d.s.makeCollection(t, d.ws, d.uid, "Tasks 2", `[]`)
	if err := d.updateSchema(t, col2, `[`+prop+`]`); err != nil {
		t.Fatal(err)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col2), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("update_schema stored %v, want %s", ids, want)
	}

	col3, err := d.createDatabase(t, "Tasks 3", `[`+prop+`]`)
	if err != nil {
		t.Fatal(err)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col3), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("create_database stored %v, want %s", ids, want)
	}
}

// A select changed to a status: every option placed by its name, ids and
// rows untouched (FR-010); an empty group gets its default option (FR-002).
func TestSelectBecomesStatusByTheGuess(t *testing.T) {
	d := newStatusDoors(t)
	selectSchema := `[{"id":"stage","name":"Stage","type":"select","options":[
		{"id":"backlog","name":"Backlog"},{"id":"done","name":"Done"},{"id":"wip","name":"Doing"}]}]`
	asStatus := strings.Replace(selectSchema, `"type":"select"`, `"type":"status"`, 1)

	for _, door := range []string{"rest", "mcp"} {
		col := d.s.makeCollection(t, d.ws, d.uid, "Tasks "+door, selectSchema)
		row := d.s.makeRow(t, d.ws, d.uid, col, "A row", `{"stage":"wip"}`)
		var err error
		if door == "rest" {
			if code, body := d.putSchema(t, col, asStatus); code != 200 {
				t.Fatalf("REST: %d %s", code, body)
			}
		} else {
			err = d.updateSchema(t, col, `[{"id":"stage","type":"status"}]`)
		}
		if err != nil {
			t.Fatalf("%s: %v", door, err)
		}
		ids, groups := optionGroups(t, d.schemaOf(t, col), "stage")
		if got := strings.Join(ids, ","); got != "backlog,wip,done" {
			t.Errorf("%s: options %s, want backlog,wip,done (group order, ids kept)", door, got)
		}
		if got := strings.Join(groups, ","); got != "todo,in_progress,complete" {
			t.Errorf("%s: groups %s, want todo,in_progress,complete", door, got)
		}
		var props string
		d.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, row).Scan(&props)
		if !strings.Contains(props, `"wip"`) {
			t.Errorf("%s: the row lost its value: %s", door, props)
		}
	}

	// Nothing the guess puts in progress or complete: those groups get their
	// default option so none is empty.
	col := d.s.makeCollection(t, d.ws, d.uid, "Ideas", `[{"id":"stage","name":"Stage","type":"select","options":[{"id":"idea","name":"Idea"}]}]`)
	if err := d.updateSchema(t, col, `[{"id":"stage","type":"status"}]`); err != nil {
		t.Fatal(err)
	}
	ids, groups := optionGroups(t, d.schemaOf(t, col), "stage")
	if strings.Join(groups, ",") != "todo,in_progress,complete" || ids[0] != "idea" {
		t.Errorf("empty groups not filled: %v %v", ids, groups)
	}

	// A brand-new status with no options starts with one per group (FR-003).
	col = d.s.makeCollection(t, d.ws, d.uid, "Fresh", `[]`)
	if err := d.updateSchema(t, col, `[{"name":"Progress","type":"status"}]`); err != nil {
		t.Fatal(err)
	}
	_, groups = optionGroups(t, d.schemaOf(t, col), "progress")
	if strings.Join(groups, ",") != "todo,in_progress,complete" {
		t.Errorf("a new status starts with %v, want one option per group", groups)
	}
}

// An option an agent sends back without its group keeps the one it has: a
// rename must not move it to a guessed group.
func TestStatusOptionKeepsItsGroupWhenSentWithout(t *testing.T) {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"a","name":"Waiting","group":"todo"},{"id":"b","name":"Blocked","group":"in_progress"},{"id":"c","name":"Done","group":"complete"}]}]`)
	// The type is sent along: update_schema without it turns the property into
	// text (#733), which this test is not about.
	if err := d.updateSchema(t, col, `[{"id":"stage","type":"status","options":[{"id":"a","name":"Waiting"},{"id":"b","name":"Stuck"},{"id":"c","name":"Done"}]}]`); err != nil {
		t.Fatal(err)
	}
	_, groups := optionGroups(t, d.schemaOf(t, col), "stage")
	if strings.Join(groups, ",") != "todo,in_progress,complete" {
		t.Errorf("renamed options moved group: %v", groups)
	}
}

// A multi-select becomes a status only when no row holds two of its values:
// a status holds one (R6). Refused on both doors, saying how many rows.
func TestMultiSelectBecomesStatusOnlyWithSingleValues(t *testing.T) {
	d := newStatusDoors(t)
	schema := `[{"id":"tags","name":"Tags","type":"multiselect","options":[{"id":"x","name":"To do"},{"id":"y","name":"Done"}]}]`
	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", schema)
	d.s.makeRow(t, d.ws, d.uid, col, "One", `{"tags":["x"]}`)
	two := d.s.makeRow(t, d.ws, d.uid, col, "Two", `{"tags":["x","y"]}`)

	asStatus := strings.Replace(schema, `"multiselect"`, `"status"`, 1)
	if code, body := d.putSchema(t, col, asStatus); code != 400 || !strings.Contains(body, "1 rows hold more than one value") {
		t.Errorf("REST: %d %s, want the refusal naming 1 row", code, body)
	}
	if err := d.updateSchema(t, col, `[{"id":"tags","type":"status"}]`); err == nil || !strings.Contains(err.Error(), "1 rows hold more than one value") {
		t.Errorf("update_schema: %v, want the refusal naming 1 row", err)
	}
	if typ := d.schemaOf(t, col)[0]["type"]; typ != "multiselect" {
		t.Errorf("the refused conversion was stored: %v", typ)
	}

	d.s.db.Exec(`UPDATE pages SET props = '{"tags":["y"]}' WHERE id = ?`, two)
	if err := d.updateSchema(t, col, `[{"id":"tags","type":"status"}]`); err != nil {
		t.Errorf("single values: %v", err)
	}
}
