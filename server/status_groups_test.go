package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"
)

// Spec 016 PR 2: conditions by a status's group (R3). group_is / group_is_not
// are resolved to is / is_not with the options in those groups at the moment
// of reading, so a view of open work keeps meaning that when someone adds or
// moves an option.

const groupsSchema = `[
	{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"later","name":"Later","group":"todo"},
		{"id":"now","name":"Now","group":"in_progress"},
		{"id":"shipped","name":"Shipped","group":"complete"}]},
	{"id":"kind","name":"Kind","type":"select","options":[{"id":"bug","name":"Bug"}]},
	{"id":"hours","name":"Hours","type":"number"}]`

type groupFixture struct {
	statusDoors
	col string
}

func newGroupFixture(t *testing.T) groupFixture {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Work", groupsSchema)
	for _, r := range []struct{ title, props string }{
		{"Idea", `{"stage":"later","hours":1}`},
		{"Busy", `{"stage":"now","hours":2}`},
		{"Done", `{"stage":"shipped","hours":4}`},
		{"Converted", `{"stage":["shipped"],"hours":8}`},
		{"Blank", `{"hours":16}`},
	} {
		d.s.makeRow(t, d.ws, d.uid, col, r.title, r.props)
	}
	return groupFixture{d, col}
}

func (g groupFixture) titles(t *testing.T, filters ...rowFilter) string {
	t.Helper()
	list, _, err := g.s.collectionRowsQuery(context.Background(), g.u, g.col, filters, nil, "", 100, 0, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	out := []string{}
	for _, r := range list {
		out = append(out, r["title"].(string))
	}
	sort.Strings(out)
	return strings.Join(out, ",")
}

// SC-001: "group is not Complete" shows what the per-option filter shows, and
// keeps following the groups when an option is added to Complete or moved
// there, with no edit to the condition.
func TestGroupConditionFollowsTheOptions(t *testing.T) {
	g := newGroupFixture(t)
	open := rowFilter{Prop: "stage", Op: "group_is_not", Values: []string{"complete"}}
	perOption := rowFilter{Prop: "stage", Op: "is_not", Values: []string{"shipped"}}
	if got, want := g.titles(t, open), g.titles(t, perOption); got != want || got != "Blank,Busy,Idea" {
		t.Fatalf("group_is_not complete = %s, per option = %s, want Blank,Busy,Idea", got, want)
	}
	if got := g.titles(t, rowFilter{Prop: "stage", Op: "group_is", Values: []string{"complete"}}); got != "Converted,Done" {
		t.Errorf("group_is complete = %s, want Converted,Done (a kept [\"id\"] included)", got)
	}
	if got := g.titles(t, rowFilter{Prop: "stage", Op: "group_is", Values: []string{"todo", "in_progress"}}); got != "Busy,Idea" {
		t.Errorf("two groups = %s", got)
	}

	// An option added to Complete, a row moved onto it: the condition, not
	// touched, leaves the row out.
	if err := g.updateSchema(t, g.col, `[{"id":"stage","type":"status","options":[
		{"id":"later","name":"Later","group":"todo"},{"id":"now","name":"Now","group":"in_progress"},
		{"id":"shipped","name":"Shipped","group":"complete"},{"id":"dropped","name":"Dropped","group":"complete"}]}]`); err != nil {
		t.Fatal(err)
	}
	g.s.db.Exec(`UPDATE pages SET props = json_set(props, '$.stage', 'dropped') WHERE title = 'Idea' AND parent_id = ?`, g.col)
	if got := g.titles(t, open); got != "Blank,Busy" {
		t.Errorf("after an option was added to Complete: %s, want Blank,Busy", got)
	}
	// "Now" moved to Complete: Busy leaves the open work too.
	if err := g.updateSchema(t, g.col, `[{"id":"stage","type":"status","options":[
		{"id":"later","name":"Later","group":"todo"},{"id":"now","name":"Now","group":"complete"},
		{"id":"shipped","name":"Shipped","group":"complete"},{"id":"dropped","name":"Dropped","group":"complete"}]}]`); err == nil {
		t.Fatal("In progress left empty was stored")
	}
	if err := g.updateSchema(t, g.col, `[{"id":"stage","type":"status","options":[
		{"id":"later","name":"Later","group":"todo"},{"id":"review","name":"Review","group":"in_progress"},
		{"id":"now","name":"Now","group":"complete"},{"id":"shipped","name":"Shipped","group":"complete"},
		{"id":"dropped","name":"Dropped","group":"complete"}]}]`); err != nil {
		t.Fatal(err)
	}
	if got := g.titles(t, open); got != "Blank" {
		t.Errorf("after Now moved to Complete: %s, want Blank", got)
	}
}

// What narrows nothing: a group condition on a property that is not a status
// (a select, or a status turned back into one), and one that names no known
// group yet. Each reads every row, as the browser's statusFilter.ts does.
func TestGroupConditionThatCannotWorkNarrowsNothing(t *testing.T) {
	g := newGroupFixture(t)
	all := g.titles(t)
	for name, f := range map[string]rowFilter{
		"on a select":        {Prop: "kind", Op: "group_is", Values: []string{"complete"}},
		"no group yet":       {Prop: "stage", Op: "group_is", Values: nil},
		"an unknown group":   {Prop: "stage", Op: "group_is", Values: []string{"later"}},
		"not in no group":    {Prop: "stage", Op: "group_is_not", Values: []string{}},
		"a missing property": {Prop: "gone", Op: "group_is_not", Values: []string{"complete"}},
	} {
		if got := g.titles(t, f); got != all {
			t.Errorf("%s: %s, want every row %s", name, got, all)
		}
	}
}

// Agents ask the same question through query_rows and get the same rows.
func TestQueryRowsTakesAGroupCondition(t *testing.T) {
	g := newGroupFixture(t)
	out, err := callTool(t, g.s, g.u, "query_rows", `{"page_id":"`+g.col+`","filter":[{"property":"stage","op":"group_is_not","values":["complete"]}]}`)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Idea", "Busy", "Blank"} {
		if !strings.Contains(out, want) {
			t.Errorf("query_rows left out %s: %s", want, out)
		}
	}
	for _, gone := range []string{`"Done"`, "Converted"} {
		if strings.Contains(out, gone) {
			t.Errorf("query_rows kept %s: %s", gone, out)
		}
	}
}

// Saving a group condition on a property that is not a status is refused,
// by one rule on every door that stores one (T025).
func TestGroupConditionOnANonStatusIsRefused(t *testing.T) {
	g := newGroupFixture(t)
	bad := `{"property":"kind","op":"group_is","values":["complete"]}`

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/collections/"+g.col, strings.NewReader(`{"views":[{"id":"t","name":"Table","type":"table","filters":[`+bad+`]}]}`))
	req.Header.Set("Cookie", g.cookie)
	req.Header.Set("Content-Type", "application/json")
	g.s.ServeHTTP(rec, req)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_group_filter") {
		t.Errorf("REST views: %d %s, want 400 invalid_group_filter", rec.Code, rec.Body.String())
	}
	if _, err := callTool(t, g.s, g.u, "set_view", `{"page_id":"`+g.col+`","type":"table","name":"T","filters":[`+bad+`]}`); err == nil || !strings.Contains(err.Error(), "status") {
		t.Errorf("set_view: %v, want a refusal naming status", err)
	}
	if _, err := callTool(t, g.s, g.u, "set_view", `{"page_id":"`+g.col+`","type":"table","name":"T","filters":[{"property":"stage","op":"group_is","values":["later"]}]}`); err == nil {
		t.Error("set_view stored a group that does not exist")
	}
	// The good one is stored, on both doors.
	if _, err := callTool(t, g.s, g.u, "set_view", `{"page_id":"`+g.col+`","type":"table","name":"Open","filters":[{"property":"stage","op":"group_is_not","values":["complete"]}]}`); err != nil {
		t.Errorf("set_view refused a good group condition: %v", err)
	}
}

// A rollup counts related rows by the related status's group (T027), and a
// group condition on something else is refused on save.
func TestRollupByGroup(t *testing.T) {
	g := newGroupFixture(t)
	projects := g.s.makeCollection(t, g.ws, g.uid, "Projects", `[
		{"id":"tasks","name":"Tasks","type":"relation","relationCollection":"`+g.col+`"}]`)
	var ids []string
	rows, _ := g.s.db.Query(`SELECT id FROM pages WHERE parent_id = ? ORDER BY title`, g.col)
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	b, _ := json.Marshal(map[string]any{"tasks": ids})
	g.s.makeRow(t, g.ws, g.uid, projects, "Launch", string(b))

	if err := g.updateSchema(t, projects, `[{"name":"Done","type":"rollup","rollupRelation":"tasks","rollupTarget":"hours","rollupAgg":"count",
		"rollupWhereProp":"stage","rollupWhereOp":"group_is","rollupWhereValues":["complete"]}]`); err != nil {
		t.Fatal(err)
	}
	list, _, err := g.s.collectionRowsQuery(context.Background(), g.u, projects, nil, nil, "", 10, 0, time.Time{})
	if err != nil || len(list) != 1 {
		t.Fatalf("rows: %v %v", list, err)
	}
	if got := list[0]["props"].(map[string]any)["done"]; jsonScalarText(got) != "2" {
		t.Errorf("rollup by group counted %v, want 2 (Done and the kept [\"id\"] Converted)", got)
	}
	if err := g.updateSchema(t, projects, `[{"name":"Bad","type":"rollup","rollupRelation":"tasks","rollupTarget":"hours","rollupAgg":"count",
		"rollupWhereProp":"kind","rollupWhereOp":"group_is","rollupWhereValues":["complete"]}]`); err == nil {
		t.Error("a rollup's group condition on a select was stored")
	}
}

// A view filtered by a single group pins that group's first option on a new
// row (FR-008); several groups pin nothing.
func TestGroupConditionPinsTheFirstOption(t *testing.T) {
	g := newGroupFixture(t)
	schema, _, _ := g.s.loadCollection(g.col)
	one := pinsFromFilters(schema, []rowFilter{{Prop: "stage", Op: "group_is", Values: []string{"in_progress"}}}, time.Now())
	if one["stage"] != "now" {
		t.Errorf("one group pinned %v, want now", one)
	}
	two := pinsFromFilters(schema, []rowFilter{{Prop: "stage", Op: "group_is", Values: []string{"todo", "complete"}}}, time.Now())
	if _, ok := two["stage"]; ok {
		t.Errorf("two groups pinned %v", two)
	}
	not := pinsFromFilters(schema, []rowFilter{{Prop: "stage", Op: "group_is_not", Values: []string{"complete"}}}, time.Now())
	if _, ok := not["stage"]; ok {
		t.Errorf("group_is_not pinned %v", not)
	}
}

// A chart counts a status by its groups when asked (R8): in workflow order,
// labelled, totals computed over the rows. Agents get the same.
func TestChartCountsAStatusByGroup(t *testing.T) {
	g := newGroupFixture(t)
	yes := true
	group := "stage"
	sum, hours := "sum", "hours"
	res, err := g.s.aggregateRows(context.Background(), g.u, g.col, aggSpec{GroupBy: group, Agg: sum, AggProp: hours, StatusGroups: yes}, nil, nil, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, gr := range res.Groups {
		v := 0.0
		if gr.Value != nil {
			v = *gr.Value
		}
		got = append(got, gr.Key+"="+strings.TrimSuffix(strings.TrimSuffix(jsonScalarText(v), ".0"), ".00"))
	}
	if strings.Join(got, ",") != "todo=1,in_progress=2,complete=12,=16" {
		t.Errorf("by group: %v, want todo=1,in_progress=2,complete=12, then No value=16", got)
	}
	if res.Groups[0].Label != "To-do" {
		t.Errorf("label %q", res.Groups[0].Label)
	}
	out, err := callTool(t, g.s, g.u, "query_rows", `{"page_id":"`+g.col+`","group_by":"stage","status_groups":true}`)
	if err != nil || !strings.Contains(out, `"in_progress"`) || strings.Contains(out, `"key":"now"`) {
		t.Errorf("query_rows status_groups: %v %s", err, out)
	}
}
