"""오프라인 단일 HTML 빌드 (Chart.js + 데이터 내장)

data.sample.json 이 없거나 weeks 가 비어 있으면 데이터를 심지 않고 빌드한다.
→ 시트 연결 전에도 레이아웃·국가 셀렉터를 확인/공유할 수 있다 (DEMO 배지로 표시됨).

※ 오프라인 파일은 /api/data 를 못 쓰므로 국가별 실데이터 전환은 불가하다.
   국가 버튼은 동작하고 통화 표기도 바뀌지만, 표시되는 수치는 내장된 것 하나뿐이다.
"""
import json, re, os

OUT = 'Dr_Rejuall_Weekly_INTL.html'

html  = open('index.html', 'r', encoding='utf-8').read()
chart = open('_chartjs.js', 'r', encoding='utf-8').read()

data = None
if os.path.exists('data.sample.json'):
    raw = open('data.sample.json', 'r', encoding='utf-8').read()
    parsed = json.loads(raw)                      # 깨진 JSON 을 심지 않도록 검증
    if isinstance(parsed.get('weeks'), list) and parsed['weeks']:
        data = raw
    else:
        print('data.sample.json 의 weeks 가 비어 있음 → 데이터 없이 빌드')
else:
    print('data.sample.json 없음 → 데이터 없이 빌드 (DEMO 모드로 열림)')

chart_safe = re.sub(r'</script', r'<\\/script', chart, flags=re.I)
cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>'
assert cdn in html, 'chart cdn tag not found'
html = html.replace(cdn, '<script>' + chart_safe + '</script>')

if data:
    # 내장 데이터가 있을 때만 loadData 앞단에 분기를 끼운다.
    # ⚠ start_find 는 fetch 인수 앞까지만 매칭한다 — 뒤에 ' + (want ? …)' 가
    #    이어지므로, 치환문을 세미콜론으로 닫으면 JS 가 깨진다.
    start_find = "  try{\n    const r = await fetch('/api/weekly-intl/data'"
    assert start_find in html, 'loadData start not found'
    start_repl = ("  if (window.__EMBEDDED_DATA__ && Array.isArray(window.__EMBEDDED_DATA__.weeks) && window.__EMBEDDED_DATA__.weeks.length){\n"
                  "    apply(window.__EMBEDDED_DATA__, 'Data source: 내장 데이터 · 오프라인');\n"
                  "  } else {\n"
                  + start_find)
    html = html.replace(start_find, start_repl, 1)

    end_find = "    }\n  }\n\n  const badge = document.getElementById('modeBadge');"
    assert end_find in html, 'loadData end not found'
    html = html.replace(end_find, "    }\n  }\n  }\n\n  const badge = document.getElementById('modeBadge');", 1)

    emb = re.sub(r'</', r'<\\/', data)
    html = html.replace('</head>', '<script>window.__EMBEDDED_DATA__ = ' + emb + ';</script>\n</head>')

open(OUT, 'w', encoding='utf-8').write(html)
os.remove('_chartjs.js')
print('built:', OUT, os.path.getsize(OUT), 'bytes', '(데이터 내장)' if data else '(데이터 없음)')
