# Ajusta o reference.docx default do pandoc: A4, margens, fonte do codigo e estilo de tabela.
# Uso: python make_ref.py <default-reference.docx> <ref.docx>
import sys
from docx import Document
from docx.shared import Mm, Pt
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

src, dst = sys.argv[1], sys.argv[2]
doc = Document(src)

for s in doc.sections:
    s.page_width, s.page_height = Mm(210), Mm(297)
    s.left_margin = s.right_margin = Mm(20)
    s.top_margin = s.bottom_margin = Mm(22)

doc.styles['Verbatim Char'].font.size = Pt(10)

# Estilo "Table": bordas cinza + primeira linha sombreada e em negrito
tbl = doc.styles['Table'].element
tblPr = tbl.find(qn('w:tblPr'))
if tblPr is None:
    tblPr = OxmlElement('w:tblPr')
    tbl.append(tblPr)
old = tblPr.find(qn('w:tblBorders'))
if old is not None:
    tblPr.remove(old)
borders = OxmlElement('w:tblBorders')
for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
    b = OxmlElement(f'w:{side}')
    b.set(qn('w:val'), 'single')
    b.set(qn('w:sz'), '4')
    b.set(qn('w:space'), '0')
    b.set(qn('w:color'), 'BFBFBF')
    borders.append(b)
tblPr.append(borders)

for old in tbl.findall(qn('w:tblStylePr')):
    if old.get(qn('w:type')) == 'firstRow':
        tbl.remove(old)
fr = OxmlElement('w:tblStylePr')
fr.set(qn('w:type'), 'firstRow')
rPr = OxmlElement('w:rPr')
rPr.append(OxmlElement('w:b'))
fr.append(rPr)
tcPr = OxmlElement('w:tcPr')
shd = OxmlElement('w:shd')
shd.set(qn('w:val'), 'clear')
shd.set(qn('w:color'), 'auto')
shd.set(qn('w:fill'), 'DCE6F1')
tcPr.append(shd)
fr.append(tcPr)
tbl.append(fr)

doc.save(dst)
print('ok', dst)
