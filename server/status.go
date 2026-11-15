package server

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
)

// The status property (spec 016): a select whose options each sit in one of
// three fixed groups. The group lives on the option in the schema
// ({"id","name","color","group"}), never on the row (research R1), so moving
// an option to another group is one schema write and every view reads the new
// group at once.
//
// Everything a schema door must do with a status is here, in one function per
// rule, so the three doors (PUT /api/collections, update_schema,
// create_database) cannot drift apart (R9).

// statusGroupIDs in workflow order: the order options are kept in (R2) and
// the order a sort by status follows (R5).
var statusGroupIDs = []string{"todo", "in_progress", "complete"}

// statusGroupLabel is the English name of a group, for refusals. The
// interface translates its own labels (web/src/statusGroups.ts).
var statusGroupLabel = map[string]string{
	"todo":        "To-do",
	"in_progress": "In progress",
	"complete":    "Complete",
}

// statusGroupDefault is the option a group gets when a status starts out or a
// conversion leaves the group empty (FR-002, FR-003).
var statusGroupDefault = map[string]string{
	"todo":        "Not started",
	"in_progress": "In progress",
	"complete":    "Done",
}

func statusGroupIndex(g string) int {
	for i, id := range statusGroupIDs {
		if id == g {
			return i
		}
	}
	return -1
}

// optionTypes are the property types whose values are option ids (R10). A
// check that means "this property has options" asks this, not == "select":
// the next type with options would otherwise miss half the places, as url and
// backrelation once did (validPropTypes).
var optionTypes = map[string]bool{"select": true, "multiselect": true, "status": true}

// errStatusOptions is a status the interface could not draw: an option
// without a known group, a group with no option, two options of one name.
// REST answers it as 400 invalid_status_options; MCP with the same sentence.
type errStatusOptions struct{ msg string }

func (e errStatusOptions) Error() string { return e.msg }

// statusWords is the word list the conversion places options by (FR-010),
// shared with the browser's guess through server/testdata/statusgroups.json:
// a Go test and check-statusgroups.mjs both read it, so the two guesses
// cannot drift (R6).
var statusWords = sync.OnceValue(func() map[string]string {
	return statusWordsFrom(statusGroupsJSON)
})

// The word list and the cases both guesses are tested against.
//
//go:embed testdata/statusgroups.json
var statusGroupsJSON []byte

func statusWordsFrom(raw []byte) map[string]string {
	var file struct {
		Words map[string][]string `json:"words"`
	}
	out := map[string]string{}
	if err := json.Unmarshal(raw, &file); err != nil {
		fmt.Fprintln(os.Stderr, "status words:", err)
		return out
	}
	for group, words := range file.Words {
		for _, w := range words {
			out[normalizeStatusName(w)] = group
		}
	}
	return out
}

// normalizeStatusName is how a name is compared with the word list: lower
// case, straight apostrophes, single spaces, no surrounding punctuation. A
// whole-name match only, not a word inside it: "Not started" holds "started"
// and is not in progress.
func normalizeStatusName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.NewReplacer("’", "'", "‘", "'", "-", " ", "_", " ").Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	return strings.Trim(s, ".!?:;,")
}

// guessStatusGroup places an option by its name (R6): Complete and In
// progress by the word list, everything else To-do.
func guessStatusGroup(name string) string {
	if g, ok := statusWords()[normalizeStatusName(name)]; ok {
		return g
	}
	return "todo"
}

// prepareStatusProps brings every status property of a schema into the shape
// the interface draws, or refuses it. In place, on the schema a door is about
// to store:
//
//   - A status that arrives with no group on any option is new or converted
//     from a select: each option is placed by guessStatusGroup and every
//     group left empty gets its default option (FR-002, FR-003, FR-010).
//   - Otherwise an option without a group is guessed, an unknown group is
//     refused, and so is a group with no option (FR-002: the last option of a
//     group cannot be removed) and two options of one name.
//   - The options are then kept in group order, their order within a group
//     unchanged (R2), so boards, charts and pickers draw the workflow order
//     without knowing about groups.
func prepareStatusProps(schema []map[string]any, was statusSnapshot) error {
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "status" {
			continue
		}
		id, _ := p["id"].(string)
		if err := prepareStatusProp(p, was.groups[id]); err != nil {
			return err
		}
	}
	return nil
}

// statusSnapshot is what a door needs to know about the schema as stored,
// taken before it merges the change in: each property's type, and each status
// option's group. An option sent without a group keeps the one it has, so an
// agent that renames an option does not send it back to a guessed group.
type statusSnapshot struct {
	types  map[string]string
	groups map[string]map[string]string
}

func snapshotStatus(schema []map[string]any) statusSnapshot {
	snap := statusSnapshot{types: map[string]string{}, groups: map[string]map[string]string{}}
	for _, p := range schema {
		id, _ := p["id"].(string)
		t, _ := p["type"].(string)
		snap.types[id] = t
		if t != "status" {
			continue
		}
		g := map[string]string{}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			oid, _ := m["id"].(string)
			if grp, _ := m["group"].(string); oid != "" && grp != "" {
				g[oid] = grp
			}
		}
		snap.groups[id] = g
	}
	return snap
}

func prepareStatusProp(p map[string]any, stored map[string]string) error {
	name, _ := p["name"].(string)
	if name == "" {
		name, _ = p["id"].(string)
	}
	var raw []any
	switch v := p["options"].(type) {
	case nil:
	case []any:
		raw = v
	case []map[string]any: // a schema built in Go (defaults, tests)
		for _, o := range v {
			raw = append(raw, o)
		}
	default:
		return errStatusOptions{fmt.Sprintf("the options of status %q must be a list", name)}
	}
	opts := make([]map[string]any, 0, len(raw))
	grouped := false
	for _, o := range raw {
		m, ok := o.(map[string]any)
		if !ok {
			return errStatusOptions{fmt.Sprintf("each option of status %q must be an {id, name, color?, group} object", name)}
		}
		if g, _ := m["group"].(string); g == "" {
			if oid, _ := m["id"].(string); stored[oid] != "" {
				m["group"] = stored[oid]
			}
		}
		if g, _ := m["group"].(string); g != "" {
			grouped = true
		}
		opts = append(opts, m)
	}
	taken := map[string]bool{}
	names := map[string]bool{}
	for _, o := range opts {
		id, _ := o["id"].(string)
		if id == "" {
			return errStatusOptions{fmt.Sprintf("each option of status %q needs an id", name)}
		}
		taken[id] = true
		n, _ := o["name"].(string)
		key := strings.ToLower(strings.TrimSpace(n))
		if names[key] {
			return errStatusOptions{fmt.Sprintf("status %q has two options named %q; each name can be used once", name, n)}
		}
		names[key] = true
	}
	count := map[string]int{}
	for _, o := range opts {
		g, _ := o["group"].(string)
		if g == "" {
			n, _ := o["name"].(string)
			g = guessStatusGroup(n)
			o["group"] = g
		}
		if statusGroupIndex(g) < 0 {
			return errStatusOptions{fmt.Sprintf("option %q of status %q is in group %q; the groups are %s", o["name"], name, g, strings.Join(statusGroupIDs, ", "))}
		}
		count[g]++
	}
	for _, g := range statusGroupIDs {
		if count[g] > 0 {
			continue
		}
		if grouped {
			return errStatusOptions{fmt.Sprintf("the %s group of status %q needs at least one option", statusGroupLabel[g], name)}
		}
		label := statusGroupDefault[g]
		if names[strings.ToLower(label)] {
			// "In progress" already exists elsewhere: keep the names unique.
			label = statusGroupLabel[g]
		}
		id := slugID(label, taken)
		taken[id] = true
		names[strings.ToLower(label)] = true
		opts = append(opts, map[string]any{"id": id, "name": label, "group": g})
	}
	sort.SliceStable(opts, func(i, j int) bool {
		gi, _ := opts[i]["group"].(string)
		gj, _ := opts[j]["group"].(string)
		return statusGroupIndex(gi) < statusGroupIndex(gj)
	})
	out := make([]any, len(opts))
	for i, o := range opts {
		out[i] = o
	}
	p["options"] = out
	return nil
}

// checkStatusConversion refuses a multi-select becoming a status while a row
// holds more than one of its values (R6): a status holds one, and keeping
// only the first would lose the others without a word. was is the schema as
// stored; next the one about to be saved. A new database (collectionID "")
// has no rows to check.
//
// Rows that hold one value keep it as stored (["id"]): a filter matches an
// array element like a scalar (rowsWhere) and the interface reads the first
// value, so no row is rewritten (the non-destructive type change, Q23).
func (s *Server) checkStatusConversion(collectionID string, was statusSnapshot, next []map[string]any) error {
	for _, p := range next {
		id, _ := p["id"].(string)
		if t, _ := p["type"].(string); collectionID == "" || t != "status" || was.types[id] != "multiselect" || !safePropID(id) {
			continue
		}
		var n int
		path := "$." + id
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND trashed_at IS NULL
			AND json_type(props, ?) = 'array' AND json_array_length(props, ?) > 1`, collectionID, path, path).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			name, _ := p["name"].(string)
			return errStatusOptions{fmt.Sprintf("%d rows hold more than one value of %q; a status holds one. Leave one value in each, then change the type", n, name)}
		}
	}
	return nil
}

// prepareStatusSchema is the whole rule for one door: the conversion check
// against the stored schema, then prepareStatusProps on what will be stored.
// Every door that writes a schema calls it: handlePutCollection,
// mcpUpdateSchema and mcpCreateDatabase (spec 015 found the third).
func (s *Server) prepareStatusSchema(collectionID string, was statusSnapshot, next []map[string]any) error {
	if err := s.checkStatusConversion(collectionID, was, next); err != nil {
		return err
	}
	return prepareStatusProps(next, was)
}

// hasStatus says whether a schema holds a status, whose options a door may
// have reordered or filled and must store as prepared.
func hasStatus(schema []map[string]any) bool {
	for _, p := range schema {
		if t, _ := p["type"].(string); t == "status" {
			return true
		}
	}
	return false
}

func isStatusErr(err error) bool {
	var e errStatusOptions
	return errors.As(err, &e)
}

// statusDefaults is the value a new row of a database starts with in each of
// its status properties: the first option of the To-do group (FR-017, owner's
// answer Q1 "A").
func (s *Server) statusDefaults(collectionID string) map[string]string {
	schema, _, err := s.loadCollection(collectionID)
	if err != nil {
		return nil
	}
	out := map[string]string{}
	for _, p := range schema {
		id, _ := p["id"].(string)
		if t, _ := p["type"].(string); t != "status" || !safePropID(id) {
			continue
		}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			if g, _ := m["group"].(string); g == "todo" {
				if oid, _ := m["id"].(string); oid != "" {
					out[id] = oid
				}
				break
			}
		}
	}
	return out
}

// fillStatusDefaults gives a row just made in a database the To-do default
// in every status it does not hold yet (R4). It runs AFTER the door stored the
// row and its values, so whatever the door wrote wins: the caller's value, a
// view's pin, a template's value. One function called by every door that makes
// a row (handleCreatePage, rowFromTemplate for both REST and MCP templates,
// create_page, create_rows, the public form, ingest); TestEveryRowDoorStartsInToDo
// lists them, so a door without the call fails there.
//
// Empty is missing: a public form or an import that sends "" for the status
// gets the default, as FR-017 says.
//
// Not called by copies (duplicate, workspace import and transfer, blueprints):
// a copy keeps what its original held, an empty status included.
func (s *Server) fillStatusDefaults(collectionID, rowID string) error {
	for prop, opt := range s.statusDefaults(collectionID) {
		path := "$." + prop
		if _, err := s.db.Exec(`UPDATE pages SET props = json_set(CASE WHEN json_valid(props) AND props <> '' THEN props ELSE '{}' END, ?, ?)
			WHERE id = ? AND parent_id = ? AND (json_type(props, ?) IS NULL OR json_type(props, ?) = 'null' OR json_extract(props, ?) = '')`,
			path, opt, rowID, collectionID, path, path, path); err != nil {
			return err
		}
	}
	return nil
}
