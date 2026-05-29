from pathlib import Path

html = Path("static/index.html").read_text(encoding="utf-8")
marker = '  <script>\n    const $ = (id) => document.getElementById(id);'
s = html.find(marker)
if s < 0:
    raise SystemExit("script marker not found")
s += len("  <script>\n")
e = html.rfind("</script>")
js = html[s:e].strip()
js = js.replace("/static/", "/assets/")
Path("frontend/src/studio-legacy.js").write_text(js, encoding="utf-8")
print("lines", js.count("\n"))
