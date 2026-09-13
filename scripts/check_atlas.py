"""Check a source checkout or built Pages artifact using only the standard library."""
import gzip
import hashlib
import json
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
page=root/'linxicon-solver/index.html'
assert page.is_file(), 'Atlas route missing'
assert (root/'linixcon-solver/index.html').is_file(), 'Redirect route missing'
# The desktop homepage lists projects from assets/js/projects.js.
assert '/linxicon-solver/' in (root/'assets/js/projects.js').read_text(), 'Homepage link missing'
manifest=json.loads((root/'linxicon-solver/data/latest.json').read_text())
assert manifest['schema_version']==1
name=manifest['file'];assert Path(name).name==name
raw=(root/'linxicon-solver/data'/name).read_bytes()
assert hashlib.sha256(raw).hexdigest()==manifest['sha256']
data=json.loads(raw)
assert data['schema_version']==1 and 2<=len(data['nodes'])<=500
words={n['word'] for n in data['nodes']}
assert {data['game']['tl'],data['game']['br']}<=words
assert all(e['a'] in words and e['b'] in words for e in data['edges'])
for candidate in data['candidates']:
    assert set(candidate['words'])<=words
    if candidate['status']=='verified':assert candidate['server_frames'][-1]['path']
assets=[p for p in (root/'assets/atlas').rglob('*') if p.suffix in ['.css','.js','.woff2']]
compressed=sum(len(gzip.compress(p.read_bytes())) for p in [page,*assets])+len(gzip.compress(raw))
assert compressed<=1_000_000,f'Initial asset budget exceeded: {compressed}'
for name in ['WordNet-LICENSE.txt','NOTICES.txt','vendor/d3-LICENSE.txt','fonts/Newsreader-LICENSE.txt','fonts/IBMPlexSans-LICENSE.txt','fonts/IBMPlexMono-LICENSE.txt']:
    assert (root/'assets/atlas'/name).is_file(),f'Missing notice: {name}'
print(f'Atlas valid: game {data["game"]["id"]}, {len(words)} nodes, {compressed:,} gzip bytes including all bundled fonts.')
