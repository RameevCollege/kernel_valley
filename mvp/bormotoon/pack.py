#!/usr/bin/env python3
"""Build a portable offline HTML and a source bundle; standard library only."""
from pathlib import Path
import base64
import json
import zipfile

root = Path(__file__).resolve().parent
out = root / 'out'
out.mkdir(exist_ok=True)
html = (root / 'index.html').read_text()
license_text = (root / 'vendor/TRON-LICENSE').read_text()
html = html.replace('<head>', '<head><!-- Bundled TRON loader license:\n' + license_text + '\n-->')
for css in ('loader.css', 'style.css'):
    html = html.replace(f'<link rel="stylesheet" href="{css}">', '<style>' + (root / css).read_text() + '</style>')
logo = base64.b64encode((root / 'assets/logo.webp').read_bytes()).decode()
html = html.replace('src="assets/logo.webp"', f'src="data:image/webp;base64,{logo}"')

def script(source):
    # No literal HTML script closing tag may occur inside an inline script.
    return '<script>' + source.replace('</script', '<\\/script') + '</script>'

vendor = json.dumps((root / 'vendor/tron-loader.html').read_text(), ensure_ascii=False)
html = html.replace('<script src="loader.js"></script>', script('window.TRON_LOADER_HTML=' + vendor + ';\n' + (root / 'loader.js').read_text()))
html = html.replace('<script src="boot.js"></script>', ''.join(script((root / name).read_text()) for name in ('game-core.js', 'game.js', 'boot.js')))
(out / 'kernel-valley.html').write_text(html)
with zipfile.ZipFile(out / 'kernel-valley-mvp.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        if file.is_file() and not any(part in ('out', '__pycache__') for part in file.relative_to(root).parts):
            archive.write(file, 'kernel-valley/' + str(file.relative_to(root)))
    archive.write(out / 'kernel-valley.html', 'kernel-valley/START.html')
for file in (out / 'kernel-valley.html', out / 'kernel-valley-mvp.zip'):
    print(f'{file}: {file.stat().st_size:,} bytes')
