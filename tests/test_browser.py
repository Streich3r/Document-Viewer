"""End-to-end browser tests: python tests/test_browser.py (requires playwright + chromium)."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import sys, json, time
from playwright.sync_api import sync_playwright
import re
ROOT=Path(__file__).resolve().parents[1]
FILES=ROOT/'testdateien'
results=[]

def check(name, condition, detail=''):
    results.append({'test':name,'ok':bool(condition),'detail':str(detail)[:400]})
    print(('PASS' if condition else 'FAIL'),name,detail)

def upload(page,filename,desired=''):
    page.locator('#fileInput').set_input_files(str(FILES/filename))
    page.wait_for_function('document.querySelector("#busy").hidden', timeout=20000)
    if desired:
        page.wait_for_timeout(300)
        text=page.locator('#renderSurface').inner_text()
        check('Upload '+filename,desired in text,text[:100])

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

# The execution sandbox blocks navigation even to localhost and data: URLs.
# Load HTML plus the original local scripts into about:blank instead.
def bootstrap(page):
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script\s+src="[^"]+"(?:\s+defer)?\s*></script>','',html)
    html=re.sub(r'<link\s+[^>]*>','',html)
    html=re.sub(r'<meta\s+http-equiv="Content-Security-Policy"[^>]*>','',html)
    page.set_content(html)
    page.add_style_tag(path=str(ROOT/'app.css'))
    for name in ['pdf.js','pdf.worker.min.js','jszip.min.js','docx-preview.min.js','mammoth.browser.min.js','xlsx.full.min.js']:
        page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(path=str(ROOT/'app.js'))

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1120,'height':800},device_scale_factor=1)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 bootstrap(page)
 check('Startbildschirm',page.locator('#dropZone').is_visible())
 check('Alle Renderbibliotheken geladen',page.evaluate("!!pdfjsLib && !!docx.renderAsync && !!XLSX && !!JSZip"))
 upload(page,'05_TXT_Umlaute.txt','Sonderzeichen: ä ö ü ß €')
 check('Dateiname',page.locator('#fileName').inner_text()=='05_TXT_Umlaute.txt')
 page.locator('#zoomInBtn').click()
 check('Zoom anheben',page.locator('#zoomLabel').inner_text()=='125%')
 page.locator('#fitBtn').click()
 check('Zoom zurücksetzen',page.locator('#zoomLabel').inner_text()=='100%')
 upload(page,'06_CSV_Trennzeichen.csv','Hallo; Welt')
 upload(page,'07_JSON_Daten.json','"app": "Matrix Viewer"')
 upload(page,'08_HTML_Sicherheitscheck.html','<script>')
 check('HTML wird nicht ausgeführt',page.evaluate('window.__injected_by_test===undefined'))
 upload(page,'04_ODT_Text.odt','ODT-Testüberschrift')
 upload(page,'02_DOCX_2_Seiten.docx','DOCX Test')
 check('DOCX Layout oder Text vorhanden',page.locator('.docx,.doc-text').count()>0)
 upload(page,'12_ODS_2_Spalten.ods','ODS-Alpha')
 upload(page,'11_XLSX_2_Tabellen.xlsx','Alpha')
 check('XLSX Blattwahl vorhanden',page.locator('.sheet-tabs button').count()==2)
 page.locator('.sheet-tabs button').nth(1).click()
 check('XLSX zweites Blatt', 'Test bestanden' in page.locator('#renderSurface').inner_text())
 upload(page,'03_PPTX_3_Folien.pptx','PPTX-Testfolie 1')
 check('PPTX 3 Folien',page.locator('#pageLabel').inner_text()=='1 / 3')
 page.locator('#nextBtn').click()
 page.wait_for_timeout(400)
 check('PPTX Folienwechsel', 'PPTX-Testfolie 2' in page.locator('#renderSurface').inner_text())
 check('PPTX eingebettetes Bild',page.locator('.ppt-slide img').count()>=1)
 upload(page,'01_PDF_3_Seiten.pdf')
 check('PDF Seite 1 Canvas',page.locator('canvas.pdf-page').count()==1)
 check('PDF 3 Seiten',page.locator('#pageLabel').inner_text()=='1 / 3')
 page.locator('#nextBtn').click()
 page.wait_for_timeout(300)
 check('PDF Seite 2',page.locator('#pageLabel').inner_text()=='2 / 3')
 page.screenshot(path=str(ROOT/'tests'/'desktop-preview.png'),full_page=True)
 page.locator('#clearBtn').click()
 check('Schließen',page.locator('#dropZone').is_visible())
 upload(page,'10_FEHLER_beschaedigte_PDF.pdf')
 check('Ungültige PDF meldet Fehler',page.locator('#message').is_visible())
 page.locator('#clearBtn').click()
 # Service Worker is tested separately with Node mocks (test_service_worker.js).
 check('Keine JS-Ausnahme',not errors,' | '.join(errors[:4]))
 mob=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 pm=mob.new_page();bootstrap(pm)
 check('Mobile Layout ohne horizontales Body-Scrolling', pm.evaluate('document.documentElement.scrollWidth <= innerWidth+2'))
 upload(pm,'01_PDF_3_Seiten.pdf')
 check('Mobile PDF vorhanden',pm.locator('canvas.pdf-page').count()==1)
 pm.screenshot(path=str(ROOT/'tests'/'mobile-preview.png'),full_page=True)
 mob.close();context.close();browser.close()

report={'total':len(results),'passed':sum(r['ok'] for r in results),'failed':sum(not r['ok'] for r in results),'results':results}
(ROOT/'tests'/'test-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('REPORT',report['passed'],'/',report['total'])
sys.exit(0 if not report['failed'] else 1)
