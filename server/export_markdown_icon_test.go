package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// A Markdown heading carries an emoji icon as text, and leaves out an icon
// that is a reference: it came out as "# /logo.svg Welcome to nigari" on every
// new instance once the starter page carried the mark (#828, #815).
func TestMarkdownHeadingKeepsOnlyAnEmojiIcon(t *testing.T) {
	cases := map[string]string{
		"🚀":                        "# 🚀 Page\n",
		"/logo.svg":                "# Page\n",
		"/files/abc.png":           "# Page\n",
		"https://x.test/a.png":     "# Page\n",
		"data:image/png;base64,AA": "# Page\n",
		"lucide:Rocket:#e03131":    "# Page\n",
		"mdi:Rocket":               "# Page\n",
		"":                         "# Page\n",
	}
	for icon, want := range cases {
		p := &page{Content: json.RawMessage(`[]`)}
		p.Title, p.Icon = "Page", icon
		if got := pageMarkdown(p); !strings.HasPrefix(got, want) {
			t.Errorf("icon %q: heading %q, want %q", icon, strings.SplitN(got, "\n", 2)[0], strings.TrimSpace(want))
		}
	}
}
