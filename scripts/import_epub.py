import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

source = Path(sys.argv[1] if len(sys.argv) > 1 else '/Users/richa/Downloads/毛泽东选集一至七卷.epub')
output = Path(__file__).resolve().parents[1] / 'public/data/library.json'
ns = {'n': 'http://www.daisy.org/z3986/2005/ncx/'}


def clean(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


with ZipFile(source) as archive:
    toc = ET.fromstring(archive.read('OEBPS/toc.ncx'))
    documents = []
    for volume_node in toc.findall('./n:navMap/n:navPoint', ns):
        volume_label = volume_node.find('n:navLabel/n:text', ns).text
        volume = re.sub(r'（.*?）', '', volume_label)
        for section_node in volume_node.findall('n:navPoint', ns):
            section = section_node.find('n:navLabel/n:text', ns).text
            for chapter in section_node.findall('n:navPoint', ns):
                title = clean(chapter.find('n:navLabel/n:text', ns).text)
                path = chapter.find('n:content', ns).attrib['src'].split('#')[0]
                root = ET.fromstring(archive.read(f'OEBPS/{path}'))
                paragraphs = []
                for element in root.iter():
                    if local_name(element.tag) == 'p':
                        text = clean(''.join(element.itertext()))
                        if text and text not in paragraphs:
                            paragraphs.append(text)
                if not paragraphs:
                    text = clean(''.join(root.itertext()))
                    paragraphs = [text] if text else []
                body = [p for p in paragraphs if p != title and not p.startswith('（一九') and not p.startswith('（二〇')]
                excerpt = next((p for p in body if len(p) > 30), body[0] if body else title)[:180]
                date = next((p for p in paragraphs[:4] if re.match(r'^（[一二三四五六七八九〇零]{9,11}）$', p)), '')
                documents.append({
                    'id': path.split('/')[-1].replace('.xhtml', '').lower(),
                    'title': title,
                    'volume': volume,
                    'year': date.strip('（）'),
                    'section': section,
                    'theme': '全文文献',
                    'excerpt': excerpt,
                    'content': paragraphs,
                })

output.write_text(json.dumps({
    'source': source.name,
    'volumes': 7,
    'count': len(documents),
    'documents': documents,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Imported {len(documents)} documents across 7 volumes to {output}')
