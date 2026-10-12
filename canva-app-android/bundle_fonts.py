"""Download the Google Fonts used by index.html into www/fonts so the APK works offline."""
import os, re, sys, urllib.request

www = sys.argv[1]
index = os.path.join(www, 'index.html')
html = open(index, encoding='utf-8').read()
m = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com/css2[^"]+)">', html)
if not m:
    sys.exit('fonts link not found in index.html')
UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
get = lambda url: urllib.request.urlopen(urllib.request.Request(url.replace('&amp;', '&'), headers={'User-Agent': UA}), timeout=60).read()
css = get(m.group(1)).decode()
os.makedirs(os.path.join(www, 'fonts'), exist_ok=True)
urls = sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css)))
for i, u in enumerate(urls):
    name = f'f{i}.woff2'
    open(os.path.join(www, 'fonts', name), 'wb').write(get(u))
    css = css.replace(u, name)
open(os.path.join(www, 'fonts', 'fonts.css'), 'w', encoding='utf-8').write(css)
html = html.replace(m.group(0), '<link rel="stylesheet" href="fonts/fonts.css">')
html = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', html)
open(index, 'w', encoding='utf-8').write(html)
print(f'bundled {len(urls)} font files')
