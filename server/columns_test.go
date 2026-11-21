package server

import (
	"strings"
	"testing"
)

// The widths a Columns block carries must reach both the public page and the
// print view, and must never reach them as anything but numbers.
func TestColumnsStyle(t *testing.T) {
	cases := []struct {
		name   string
		widths any
		n      int
		want   string
	}{
		{"two", "70,30", 2, ` style="--cols:minmax(0,70fr) minmax(0,30fr)"`},
		{"three", "25,50,25", 3, ` style="--cols:minmax(0,25fr) minmax(0,50fr) minmax(0,25fr)"`},
		{"none is equal columns", "", 2, ""},
		{"absent is equal columns", nil, 2, ""},
		{"a layout for another count is ignored", "70,30", 3, ""},
		{"text is ignored", "a,b", 2, ""},
		{"NaN is ignored", "NaN,50", 2, ""},
		{"a sliver is ignored", "99,1", 2, ""},
		{"markup is ignored", `70,30" onload="evil()`, 2, ""},
		{"a css escape is ignored", "70;color:red,30", 2, ""},
		{"not a string", 70.0, 2, ""},
	}
	for _, c := range cases {
		props := map[string]any{"widths": c.widths}
		if got := columnsStyle(props, c.n); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestColumnWidthsReachPublicAndPrint(t *testing.T) {
	content := []byte(`[
 {"type":"columns","props":{"count":2,"widths":"70,30"},"children":[
  {"type":"paragraph","content":[{"type":"text","text":"Wide"}]},
  {"type":"paragraph","content":[{"type":"text","text":"Narrow"}]}]},
 {"type":"columns","props":{"count":2},"children":[
  {"type":"paragraph","content":[{"type":"text","text":"Equal"}]}]}
 ]`)
	want := `<div class="cols" data-count="2" style="--cols:minmax(0,70fr) minmax(0,30fr)">`
	for name, got := range map[string]string{"public": publicBlocksHTML(content), "print": blocksToHTML(content)} {
		if !strings.Contains(got, want) {
			t.Errorf("%s: widths missing from %s", name, got)
		}
		// The second block has no widths, so it must not inherit the first's.
		if strings.Count(got, "--cols") != 1 {
			t.Errorf("%s: equal columns got a layout: %s", name, got)
		}
	}
	// Narrow screens must still stack: nothing may set grid-template-columns
	// inline, or it would beat the media query.
	if strings.Contains(publicBlocksHTML(content), "grid-template-columns") {
		t.Error("an inline grid-template-columns would defeat the narrow-screen rule")
	}
}

// Spec 021 (R5): the editor makes up to four columns, so the print view, the
// shared page and Markdown (what an agent reads and writes) take four too. A
// count the editor never makes reads as two, as before. The bug this guards:
// a fourth column drawn wrapped under the others in print and on a shared
// page, because those readers knew only 2 and 3.
func TestFourColumnsEverywhere(t *testing.T) {
	content := []byte(`[
 {"type":"columns","props":{"count":4,"widths":"40,20,20,20"},"children":[
  {"type":"paragraph","content":[{"type":"text","text":"A"}]},
  {"type":"paragraph","content":[{"type":"text","text":"B"}]},
  {"type":"paragraph","content":[{"type":"text","text":"C"}]},
  {"type":"paragraph","content":[{"type":"text","text":"D"}]}]},
 {"type":"columns","props":{"count":9},"children":[
  {"type":"paragraph","content":[{"type":"text","text":"E"}]},
  {"type":"paragraph","content":[{"type":"text","text":"F"}]}]},
 {"type":"columns","props":{"count":0},"children":[
  {"type":"paragraph","content":[{"type":"text","text":"G"}]},
  {"type":"paragraph","content":[{"type":"text","text":"H"}]}]}
 ]`)
	want := `<div class="cols" data-count="4" style="--cols:minmax(0,40fr) minmax(0,20fr) minmax(0,20fr) minmax(0,20fr)">`
	for name, got := range map[string]string{"public": publicBlocksHTML(content), "print": blocksToHTML(content)} {
		if !strings.Contains(got, want) {
			t.Errorf("%s: four columns not drawn as four: %s", name, got)
		}
		// More than four is drawn as four, as the editor draws it (blocks.tsx);
		// review found the readers drawing 2 where the editor drew 4.
		if !strings.Contains(got, `<div class="cols" data-count="4">`) {
			t.Errorf("%s: a count over four is not drawn as four: %s", name, got)
		}
		if !strings.Contains(got, `<div class="cols" data-count="2">`) {
			t.Errorf("%s: a count under two is not read as two: %s", name, got)
		}
	}
	for name, css := range map[string]string{"public": publicBlockLayout, "print": htmlDocStyle} {
		if !strings.Contains(css, `.cols[data-count="4"]{grid-template-columns:var(--cols,repeat(4,minmax(0,1fr)))}`) && !strings.Contains(css, `.public-doc .cols[data-count="4"]{grid-template-columns:var(--cols,repeat(4,minmax(0,1fr)))}`) {
			t.Errorf("%s: no four-column rule in the stylesheet", name)
		}
	}
	md := blocksToMarkdown(content)
	if strings.Count(md, "::: {.column width=") != 4 {
		t.Errorf("Markdown lost a column or its width:\n%s", md)
	}
	back, _ := mdToBlocksJSON(md)
	if !strings.Contains(back, `"count":4`) || !strings.Contains(back, `"widths":"40,20,20,20"`) {
		t.Errorf("four columns did not come back from Markdown: %s", back)
	}
}
