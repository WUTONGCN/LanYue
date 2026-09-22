"""Prepare reproducible local smoke fixtures; needs python-docx/openpyxl/python-pptx."""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parent.parent
upstream=root/'vendor/kkFileView'
subprocess.run([sys.executable,str(upstream/'tests/e2e/scripts/generate-office-fixtures.py')],cwd=upstream,check=True)
p=upstream/'tests/e2e/fixtures'
v=[(0,0,0),(40,0,0),(40,24,0),(0,24,0),(0,0,16),(40,0,16),(40,24,16),(0,24,16)]
faces=[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
text='solid sample\n'
for face in faces:
 text+='facet normal 0 0 0\nouter loop\n'+''.join('vertex %s %s %s\n'%v[i] for i in face)+'endloop\nendfacet\n'
(p/'sample.stl').write_text(text+'endsolid sample\n')
print('Default desktop smoke fixtures prepared:',p)
