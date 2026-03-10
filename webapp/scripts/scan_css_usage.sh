#!/usr/bin/env bash
# Purpose : Compare classes used in code vs classes defined in CSS (globals.css et al)
# Usage   : bash webapp/scripts/scan_css_usage.sh
set -Eeuo pipefail

# Enter webapp if launched from repo root
if [ -d "webapp" ] && [ -f "webapp/package.json" ]; then
  cd webapp
fi

mkdir -p .scan

CSS_GLOBS='{app,components,src,styles}/**/*.{css,scss}'
CODE_GLOBS='{app,components,src,pages}/**/*.{tsx,ts,jsx,js,mdx,html}'

# Detect ripgrep PCRE2 (-P) and multiline (-U)
if rg -P -n '' <<< '' >/dev/null 2>&1; then RG_PCRE='-P'; else RG_PCRE=''; fi
RG_MULTI='-U'  # enable multiline so braces/args spanning lines are captured
echo "→ Using ripgrep PCRE2 (-P): $([ -n "$RG_PCRE" ] && echo yes || echo no)"

# ─────────────────────────────────────────────────────────────────────────────
# 1) Collect classes defined in CSS (strip the leading dot)
# ─────────────────────────────────────────────────────────────────────────────
rg -h -o ${RG_PCRE:+-P} --no-line-number --glob "$CSS_GLOBS" -- '\.[A-Za-z_][A-Za-z0-9_-]*' \
  | sed 's/^\.//' \
  | sort -u > .scan/defined_css_classes.txt

# Derive prefixes (part before first '-')
awk -F'-' '{print $1}' .scan/defined_css_classes.txt | sort -u > .scan/defined_prefixes.txt

# Manual known prefixes for house classes that don't always use hyphens
cat > .scan/known_prefixes_manual.txt <<'EOF'
hdr
ftr
nav
navbar
link
mono
h1
h2
section
u
btn
chip
pill
tab
tabs
toast
toggle
badge
metric
table
modal
dark
card
panel
glass
model
ov
challenge
stat
progress
timeline
switch
skeleton
empty
subnav
hero
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 2) Extract *only* class token strings from code
#    We collect in multiple passes and append to .scan/class_attr_chunks.txt
# ─────────────────────────────────────────────────────────────────────────────
: > .scan/class_attr_chunks.txt

# 2A) Direct attributes with quotes/backticks
rg -h -o ${RG_PCRE:+-P} --no-line-number --glob "$CODE_GLOBS" -- '(?<=\bclass(?:Name)?\s*=\s*")[^"]+(?=")' \
  >> .scan/class_attr_chunks.txt || true
rg -h -o ${RG_PCRE:+-P} --no-line-number --glob "$CODE_GLOBS" -- "(?<=\\bclass(?:Name)?\\s*=\\s*')[^']+(?=')" \
  >> .scan/class_attr_chunks.txt || true
rg -h -o ${RG_PCRE:+-P} --no-line-number --glob "$CODE_GLOBS" -- '(?<=\bclass(?:Name)?\s*=\s*`)[^`]+(?=`)' \
  >> .scan/class_attr_chunks.txt || true

# 2B) Attributes with braces: className={ ... "tokens" ... }
#     Use \K to keep only the inner quoted/backticked content matched.
rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- '\bclass(?:Name)?\s*=\s*\{[^}]*"\K[^"]+(?="[^}]*\})' \
  >> .scan/class_attr_chunks.txt || true
rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- "\\bclass(?:Name)?\\s*=\\s*\\{[^}]*'\\K[^']+(?='[^}]*\\})" \
  >> .scan/class_attr_chunks.txt || true
rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- '\bclass(?:Name)?\s*=\s*\{[^}]*`\K[^`]+(?=`[^}]*\})' \
  >> .scan/class_attr_chunks.txt || true

# 2C) cn()/clsx()/classnames() anywhere in code: extract their string args
for FN in 'cn' 'clsx' 'classnames'; do
  # double-quoted (no backticks) → safe
  rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- "\\b${FN}\\([^)]*\"\\K[^\"]+(?=\"[^)]*\\))" \
    >> .scan/class_attr_chunks.txt || true
  rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- "\\b${FN}\\([^)]*'\\K[^']+(?='[^)]*\\))" \
    >> .scan/class_attr_chunks.txt || true
  # backtick pattern must NOT be in double quotes (or bash does cmd-subst).
  # Use single quotes with variable interpolation via split quoting:
  rg -h -o ${RG_PCRE:+-P} $RG_MULTI --no-line-number --glob "$CODE_GLOBS" -- '\b'"${FN}"'\([^)]*`\\K[^`]+(?=`[^)]*\))' \
    >> .scan/class_attr_chunks.txt || true
done

# Count raw chunks (diagnostic)
RAW_CHUNKS=$(wc -l < .scan/class_attr_chunks.txt || echo 0)

# Strip template interpolations ${...}, then split on whitespace/newlines
sed -E 's/\$\{[^}]+\}//g' .scan/class_attr_chunks.txt \
  | tr '[:space:]' '\n' \
  | sed -E '/^$/d' \
  > .scan/used_tokens_raw.txt

# 2D) Drop obvious utilities/noise (Tailwind, layout, etc.)
grep -E '^[A-Za-z0-9_-]+$' .scan/used_tokens_raw.txt \
  | grep -Ev '(^-|^--|^[0-9])' \
  | grep -Ev '^(sm|md|lg|xl|2xl)$' \
  | grep -Ev '^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space|gap|w|min|max|h|z|top|left|right|bottom|inset|order|col|row|grid|flex|basis|grow|shrink|place|items|justify|content)$' \
  | grep -Ev '^(text|font|leading|tracking|truncate|whitespace|italic|underline|decoration|line-through)$' \
  | grep -Ev '^(bg|from|via|to|fill|stroke|ring|shadow|border|rounded|outline|opacity|backdrop|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|drop-shadow)$' \
  | grep -Ev '^(transition|duration|delay|ease|animate|motion|cursor|select|pointer-events|sr-only|container|prose)$' \
  | grep -Ev '^(sticky|fixed|absolute|relative|isolate|overflow|object|origin|scale|rotate|translate|skew)$' \
  > .scan/used_tokens_preawk.txt

# ─────────────────────────────────────────────────────────────────────────────
# 3) Keep rule: token must be defined in CSS, OR have '-'/'_', OR share prefix
#    with a known/defined prefix. (Prevents "Add/Case/Trim" noise.)
# ─────────────────────────────────────────────────────────────────────────────
awk '
BEGIN{
  while ((getline line < ".scan/defined_css_classes.txt")>0) {def[line]=1}
  while ((getline line < ".scan/defined_prefixes.txt")>0) {pref[line]=1}
  while ((getline line < ".scan/known_prefixes_manual.txt")>0) {pref[line]=1}
}
function valid_chars(s){ return s ~ /^[A-Za-z0-9_-]+$/ }
function has_dash_or_us(s){ return s ~ /[-_]/ }
{
  t=$0
  if (!valid_chars(t)) next
  if (t ~ /^--?/) next
  if (t ~ /^[0-9]/) next

  if (def[t]) {print t; next}     # defined in CSS → keep

  split(t, parts, "-")
  p=parts[1]
  if (pref[p]) {print t; next}    # known prefix → keep
  if (has_dash_or_us(t)) {print t; next}  # BEM-ish/hyphen/underscore → keep
}' .scan/used_tokens_preawk.txt \
  | sort -u > .scan/used_project_classes.txt

# ─────────────────────────────────────────────────────────────────────────────
# 4) Compare used vs defined
# ─────────────────────────────────────────────────────────────────────────────
comm -23 .scan/used_project_classes.txt .scan/defined_css_classes.txt > .scan/missing_in_css.txt
comm -13 .scan/used_project_classes.txt .scan/defined_css_classes.txt > .scan/unused_css_classes.txt

# ─────────────────────────────────────────────────────────────────────────────
# 5) CSS vars defined vs referenced
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "$RG_PCRE" ]; then
  rg -h -o -P --no-line-number --glob "$CSS_GLOBS" -- '--[[:alnum:]_-]+(?=\s*:)' \
    | sort -u > .scan/css_vars_defined.txt
else
  rg -h -o --no-line-number --glob "$CSS_GLOBS" -- '--[[:alnum:]_-]+\s*:' \
    | sed -E 's/[[:space:]]*:$//' \
    | sort -u > .scan/css_vars_defined.txt
fi
rg -h -o --no-line-number --glob "$CSS_GLOBS" -- 'var\(--[[:alnum:]_-]+' | sed 's/^var(//' | sort -u > .scan/css_vars_used_css.txt
rg -h -o --no-line-number --glob "$CODE_GLOBS" -- '--[[:alnum:]_-]+' | sort -u > .scan/css_vars_used_code.txt
cat .scan/css_vars_used_css.txt .scan/css_vars_used_code.txt | sort -u > .scan/css_vars_used_all.txt
comm -23 .scan/css_vars_used_all.txt .scan/css_vars_defined.txt > .scan/vars_used_but_undefined.txt
comm -13 .scan/css_vars_used_all.txt .scan/css_vars_defined.txt > .scan/vars_defined_but_unused.txt

# ─────────────────────────────────────────────────────────────────────────────
# 6) data-* parity
# ─────────────────────────────────────────────────────────────────────────────
rg -h -o --no-line-number --glob "$CSS_GLOBS" -- '\[data-[A-Za-z0-9_-]+' | sed 's/^\[//' | sort -u > .scan/css_data_attrs.txt
rg -h -o --no-line-number --glob "$CODE_GLOBS" -- 'data-[A-Za-z0-9_-]+' | sort -u > .scan/code_data_attrs.txt
comm -23 .scan/code_data_attrs.txt .scan/css_data_attrs.txt > .scan/data_attrs_used_but_not_styled.txt
comm -13 .scan/code_data_attrs.txt .scan/css_data_attrs.txt > .scan/data_attrs_styled_but_not_used.txt

# ─────────────────────────────────────────────────────────────────────────────
# 7) Summary
# ─────────────────────────────────────────────────────────────────────────────
echo "=== SCAN SUMMARY (webapp/.scan) ==="
for f in defined_css_classes used_project_classes missing_in_css unused_css_classes css_vars_defined css_vars_used_all vars_used_but_undefined vars_defined_but_unused css_data_attrs code_data_attrs data_attrs_used_but_not_styled data_attrs_styled_but_not_used; do
  printf "%-36s %7s\n" "$f" "$(wc -l < ".scan/$f.txt" 2>/dev/null || echo 0)"
done
echo
echo "Raw class attr chunks captured: $RAW_CHUNKS"
echo
echo "Top 60 missing_in_css:"
head -n 60 .scan/missing_in_css.txt 2>/dev/null || true

# Optional: quick context viewer helper
cat > .scan/how_to_grep_missing.md <<'MD'
# View where a missing class is used
# Replace CLASS with a line from .scan/missing_in_css.txt
rg -n --glob '{app,components,src,pages}/**/*.{tsx,ts,jsx,js,mdx,html}' -- 'class(Name)?[^\\n]*\\bCLASS\\b'
MD