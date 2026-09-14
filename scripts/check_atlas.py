"""Check a source checkout or built Pages artifact using only the standard library."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
page=root/'linxicon-solver/index.html'
assert page.is_file(), 'Atlas route missing'
assert (root/'linixcon-solver/index.html').is_file(), 'Redirect route missing'
assert '/linxicon-solver/' in (root/'index.html').read_text(), 'Homepage link missing'
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
graph=json.loads((root/'linxicon-solver/data/graph.json').read_text())
assert graph['schema_version']==1 and re.fullmatch(r'graph-[a-f0-9]{16}\.bin',graph['file']),'Invalid graph manifest'
graph_raw=(root/'linxicon-solver/data'/graph['file']).read_bytes()
assert hashlib.sha256(graph_raw).hexdigest()==graph['sha256'],'Graph bundle checksum mismatch'
assert len(graph_raw)<=8_000_000,f'Graph bundle too large: {len(graph_raw)}'
unpacked=gzip.decompress(graph_raw)
assert unpacked[:4]==b'LXG1','Graph bundle is not LXG1'
words_count,edges_count=struct.unpack_from('<II',unpacked,4)
assert (words_count,edges_count)==(graph['words'],graph['edges']),'Graph header disagrees with manifest'
rejected=json.loads((root/'linxicon-solver/data/rejected.json').read_text())
assert rejected['schema_version']==1 and all(isinstance(w,str) and w.isalpha() and w.islower() for w in rejected['words']),'Invalid rejected list'
assert rejected['words']==sorted(set(rejected['words'])),'Rejected list must be sorted and unique'
assets=[p for p in (root/'assets/atlas').rglob('*') if p.suffix in ['.css','.js','.woff2']]
compressed=sum(len(gzip.compress(p.read_bytes())) for p in [page,*assets])+len(gzip.compress(raw))
assert compressed<=1_000_000,f'Initial asset budget exceeded: {compressed}'
for name in ['WordNet-LICENSE.txt','NOTICES.txt','vendor/d3-LICENSE.txt','vendor/gsap-LICENSE.txt','fonts/BricolageGrotesque-LICENSE.txt']:
    assert (root/'assets/atlas'/name).is_file(),f'Missing notice: {name}'
print(f'Atlas valid: game {data["game"]["id"]}, {len(words)} nodes, {compressed:,} gzip bytes including all bundled fonts; graph bundle {words_count:,} words, {edges_count:,} links, {len(graph_raw):,} bytes (lazy).')
