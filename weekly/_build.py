import json, re, os

html  = open('index.html','r',encoding='utf-8').read()
data  = open('data.sample.json','r',encoding='utf-8').read()
chart = open('_chartjs.js','r',encoding='utf-8').read()
json.loads(data)

chart_safe = re.sub(r'</script', r'<\\/script', chart, flags=re.I)
cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>'
assert cdn in html, 'chart cdn tag not found'
html = html.replace(cdn, '<script>' + chart_safe + '</script>')

start_find = "  try{\n    const r = await fetch('/api/data');"
assert start_find in html, 'loadData start not found'
start_repl = ("  if (window.__EMBEDDED_DATA__ && Array.isArray(window.__EMBEDDED_DATA__.weeks) && window.__EMBEDDED_DATA__.weeks.length){\n"
              "    apply(window.__EMBEDDED_DATA__, 'Data source: 내장 데이터 · 오프라인');\n"
              "  } else {\n"
              "  try{\n    const r = await fetch('/api/data');")
html = html.replace(start_find, start_repl, 1)

end_find = "    }\n  }\n\n  const badge = document.getElementById('modeBadge');"
assert end_find in html, 'loadData end not found'
html = html.replace(end_find, "    }\n  }\n  }\n\n  const badge = document.getElementById('modeBadge');", 1)

emb = re.sub(r'</', r'<\\/', data)
html = html.replace('</head>', '<script>window.__EMBEDDED_DATA__ = ' + emb + ';</script>\n</head>')

open('Dr_Rejuall_Weekly_Lite.html','w',encoding='utf-8').write(html)
os.remove('_chartjs.js')
print('built bytes:', os.path.getsize('Dr_Rejuall_Weekly_Lite.html'))
