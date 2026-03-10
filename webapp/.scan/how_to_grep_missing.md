# View where a missing class is used
# Replace CLASS with a line from .scan/missing_in_css.txt
rg -n --glob '{app,components,src,pages}/**/*.{tsx,ts,jsx,js,mdx,html}' -- 'class(Name)?[^\\n]*\\bCLASS\\b'
