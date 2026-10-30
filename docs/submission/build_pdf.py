#!/usr/bin/env python3
"""Builds the two submission PDFs from Markdown with Python's `markdown` module and headless Chrome (no other dependency).

    python3 -I docs/submission/build_pdf.py                      # both
Output: docs/submission/out/fries_FilsPay_Submission.pdf, fries_FilsPay_Slides.pdf
The submission is docs/submission/SUBMISSION.md plus the generated findings report (docs/audit/REPORT.md) as section 4's body.
Slides are docs/submission/SLIDES.md: slides separated by a line containing only `---`.
"""
import os, re, shutil, subprocess, sys, tempfile
import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
TEAM = "fries"

CSS_DOC = """
@page { size: A4; margin: 16mm 14mm; }
body { font: 10.5pt/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; }
h1 { font-size: 22pt; border-bottom: 2px solid #111; padding-bottom: 4px; } h2 { font-size: 15pt; margin-top: 22px; border-bottom: 1px solid #bbb; }
h3 { font-size: 12pt; margin-top: 16px; } h4 { font-size: 10.5pt; margin: 10px 0 2px; }
table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 8px 0; page-break-inside: auto; } tr { page-break-inside: avoid; }
th, td { border: 1px solid #bbb; padding: 3px 6px; vertical-align: top; } th { background: #eee; }
code, pre { font: 8.8pt/1.35 Consolas, "DejaVu Sans Mono", monospace; background: #f3f3f3; } pre { padding: 6px 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
img { max-width: 100%; border: 1px solid #ccc; } blockquote { margin: 6px 0; padding: 4px 10px; border-left: 3px solid #999; color: #333; background: #fafafa; }
a { color: #0645ad; text-decoration: none; } .pb { page-break-before: always; }
"""
CSS_SLIDES = """
@page { size: 297mm 167mm; margin: 0; }
* { box-sizing: border-box; } body { margin: 0; font: 15pt/1.35 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; }
section.slide { width: 297mm; height: 167mm; padding: 14mm 18mm; page-break-after: always; overflow: hidden; position: relative; }
section.slide h1 { font-size: 30pt; margin: 0 0 8px; color: #b13a00; } section.slide h2 { font-size: 22pt; margin: 0 0 10px; color: #b13a00; }
section.slide ul { margin: 6px 0 6px 18px; padding: 0; } section.slide li { margin: 4px 0; }
table { border-collapse: collapse; font-size: 12pt; margin: 8px 0; } th, td { border: 1px solid #bbb; padding: 3px 8px; } th { background: #f1e3da; }
code { font: 11pt Consolas, "DejaVu Sans Mono", monospace; background: #f3f3f3; padding: 0 3px; } pre { font: 10.5pt/1.3 Consolas, monospace; background: #f3f3f3; padding: 6px 10px; }
img { max-height: 105mm; max-width: 100%; border: 1px solid #ccc; } .small { font-size: 11pt; color: #444; } .foot { position: absolute; bottom: 6mm; right: 18mm; font-size: 9pt; color: #777; }
"""

def md_to_html(text, base):
    return markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists", "toc"], output_format="html5")

def to_pdf(html, pdf_path):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, dir=HERE, encoding="utf-8") as fh:
        fh.write(html); tmp = fh.name
    try:
        subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", "file://" + tmp],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
    finally:
        os.unlink(tmp)

def fix_images(text):
    # images are referenced relative to docs/submission/; make them absolute file URLs for Chrome
    return re.sub(r"!\[([^\]]*)\]\((?!https?:|file:)([^)]+)\)", lambda m: f"![{m.group(1)}](file://{os.path.join(HERE, m.group(2))})", text)

def build_submission():
    body = open(os.path.join(HERE, "SUBMISSION.md"), encoding="utf-8").read()
    report = open(os.path.join(HERE, "..", "audit", "REPORT.md"), encoding="utf-8").read()
    # the generated report's "## 2. Bugs" .. "## 4." sections become the findings detail; rename its headings one level down
    m = re.search(r"^## 2\. Bugs.*?(?=^## 5\. Decisions taken)", report, re.S | re.M)
    findings = m.group(0) if m else report
    findings = re.sub(r"^## ", "#### ", findings, flags=re.M).replace("#### 2. Bugs (by severity)", "#### Findings by severity").replace("#### 3. Fixed bugs: tests that had to change", "#### Tests that had to change").replace("#### 4. Reported but not a code bug", "#### Reported but not a code bug")
    body = body.replace("<!--FINDINGS-->", findings)
    body = body.replace("{{LOAD_TABLE}}", open(os.path.join(HERE, "LOAD_TABLE.md"), encoding="utf-8").read())
    body = body.replace("{{UI_SECTION}}", open(os.path.join(HERE, "UI.md"), encoding="utf-8").read())
    index = open(os.path.join(HERE, "..", "audit", "INDEX.md"), encoding="utf-8").read()
    m2 = re.search(r"Counts: (.*?) \((\d+) findings, (\d+) fixed", index)
    sev, n_find, n_fixed = (m2.group(1), m2.group(2), m2.group(3)) if m2 else ("", "?", "?")
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=HERE).stdout.strip()
    for k, v in {"{{N_FINDINGS}}": n_find, "{{N_FIXED}}": n_fixed, "{{SEVERITY_COUNTS}}": sev,
                 "{{FORK_URL}}": os.environ.get("FORK_URL", "(see submission form)"), "{{LAST_COMMIT}}": os.environ.get("LAST_COMMIT", commit)}.items():
        body = body.replace(k, v)
    html = f"<html><head><meta charset='utf-8'><style>{CSS_DOC}</style></head><body>{md_to_html(fix_images(body), HERE)}</body></html>"
    to_pdf(html, os.path.join(OUT, f"{TEAM}_FilsPay_Submission.pdf"))

def build_slides():
    text = open(os.path.join(HERE, "SLIDES.md"), encoding="utf-8").read()
    slides = [s.strip() for s in re.split(r"^---\s*$", text, flags=re.M) if s.strip()]
    parts = []
    for i, s in enumerate(slides, 1):
        parts.append(f"<section class='slide'>{md_to_html(fix_images(s), HERE)}<div class='foot'>{TEAM} · FilsPay · {i}/{len(slides)}</div></section>")
    html = f"<html><head><meta charset='utf-8'><style>{CSS_SLIDES}</style></head><body>{''.join(parts)}</body></html>"
    to_pdf(html, os.path.join(OUT, f"{TEAM}_FilsPay_Slides.pdf"))

if __name__ == "__main__":
    if not CHROME: sys.exit("no headless Chrome/Chromium found")
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("both", "submission"): build_submission()
    if which in ("both", "slides"): build_slides()
    print("built", os.listdir(OUT))
