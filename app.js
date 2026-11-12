/* IVY Docs V3. All source files remain on-device. No document network requests. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['app','matrixCanvas','fileInput','openBtn','clearBtn','fileName','fileMeta','status','dropZone','viewerShell','viewerScroll','renderSurface','busy','busyText','message','prevBtn','nextBtn','pageLabel','zoomOutBtn','zoomInBtn','zoomLabel','fitBtn','fullscreenBtn','updateToast','reloadBtn'].map(id => [id,$(id)]));
const supported = new Set(['pdf','docx','xlsx','xls','ods','odt','pptx','odp','epub','cbz','fb2','txt','md','markdown','csv','tsv','json','jsonl','ndjson','yaml','yml','toml','ini','conf','ics','vcf','eml','srt','vtt','sql','py','js','ts','css','html','htm','xml','log','rtf','diff','patch','sh','png','jpg','jpeg','webp','gif','svg','bmp','avif']);
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED = 250 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 3000;
const state = {file:null,type:null,buffer:null,pdf:null,pdfPageCount:0,renderTask:null,slideZip:null,slidePaths:[],slideSize:[12192000,6858000],page:1,pageCount:1,zoom:1,basePdfWidth:0,basePptWidth:960,bookChapters:[],comicPages:[],openZip:null,pptTheme:{},urls:[],generation:0,fit:true,wb:null,sheetIndex:0,resizeTimer:0,renderToken:0};
const ext = name => (name.toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||'';
const el = (tag,cls,txt) => {const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=String(txt);return node;};
const setStatus = text => {ui.status.textContent=text;};
const showMessage = (msg,error=true) => {ui.message.textContent=msg;ui.message.style.background=error?'#3a1010':'#12432a';ui.message.hidden=false;clearTimeout(showMessage.timer);showMessage.timer=setTimeout(()=>ui.message.hidden=true,7500);};
const busy = (on,text='Lade Dokument …') => {ui.busy.hidden=!on;ui.busyText.textContent=text;};
const fileBytes = file => file.arrayBuffer();
function humanBytes(n){return n < 1024 ? n+' B' : n < 1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(1)+' MB';}
function assertZipReasonable(zip){let total=0,count=0;for(const item of Object.values(zip.files)){if(item.dir)continue;count++;total+=item._data?.uncompressedSize||0;if(count>MAX_ZIP_ENTRIES||total>MAX_ZIP_UNCOMPRESSED)throw Error('Archiv überschreitet das sichere Größenlimit.');}}
function cleanupUrls(){for(const url of state.urls) URL.revokeObjectURL(url);state.urls=[];}
function createBlobUrl(blob){const url=URL.createObjectURL(blob);state.urls.push(url);return url;}
async function clearCurrent(){state.generation++;state.renderToken++;if(state.renderTask){try{state.renderTask.cancel();await state.renderTask.promise.catch(()=>{});}catch{}state.renderTask=null;}if(state.pdf){try{await state.pdf.destroy();}catch{}state.pdf=null;}cleanupUrls();state.file=null;state.type=null;state.buffer=null;state.wb=null;state.slideZip=null;state.slidePaths=[];state.openZip=null;state.bookChapters=[];state.comicPages=[];state.pptTheme={};state.odpPages=[];state.odpStyles={};state.page=1;state.pageCount=1;state.zoom=1;state.fit=true;state.sheetIndex=0;ui.renderSurface.replaceChildren();ui.viewerShell.hidden=true;ui.dropZone.hidden=false;ui.clearBtn.disabled=true;ui.clearBtn.hidden=true;ui.fileName.textContent='Keine Datei ausgewählt';ui.fileName.title='';ui.fileMeta.textContent='Keine Daten werden hochgeladen';ui.fileInput.value='';ui.message.hidden=true;setStatus('BEREIT · LOKALER MODUS');updateControls();}
function updateControls(){const has=Boolean(state.file);const paged=has&&state.pageCount>1;ui.prevBtn.disabled=!paged||state.page<=1;ui.nextBtn.disabled=!paged||state.page>=state.pageCount;document.getElementById('documentControls').hidden=!has;document.getElementById('pagination').hidden=!paged;ui.pageLabel.textContent=has?`${state.page} / ${state.pageCount}`:'– / –';ui.zoomOutBtn.disabled=!has||state.zoom<=.4;ui.zoomInBtn.disabled=!has||state.zoom>=5;ui.fitBtn.disabled=!has;ui.zoomLabel.textContent=Math.round(state.zoom*100)+'%';}
function resetSurface(resetScroll=true){ui.renderSurface.replaceChildren();if(resetScroll)ui.viewerScroll.scrollTo({top:0,left:0,behavior:'instant'});}
function refreshZoom(){
 if(!state.file)return;
 if(state.type==='pdf'){renderPdfPage(state.generation,true);return;}
 if(state.type==='pptx'){showPptSlide(state.generation,true);return;}
 if(state.type==='odp'){showOdpSlide(state.generation,true);return;}
 const target=ui.renderSurface.firstElementChild;
 if(target){target.style.zoom=String(state.zoom);}
 updateControls();
}
function changeZoom(mult){state.zoom=Math.min(5,Math.max(.4,Math.round(state.zoom*mult*100)/100));state.fit=false;refreshZoom();}
async function openFile(file){if(!file)return;const type=ext(file.name);if(!supported.has(type)){showMessage('Dateiformat nicht unterstützt: .'+type);return;}if(file.size>MAX_FILE_BYTES){showMessage('Datei ist zu groß (maximal 100 MB).');return;}
  await clearCurrent();const generation=++state.generation;state.file=file;state.type=type;state.page=1;state.zoom=1;ui.fileName.textContent=file.name;ui.fileName.title=file.name;ui.fileMeta.textContent=humanBytes(file.size)+' · '+type.toUpperCase()+' · nur lokal';ui.dropZone.hidden=true;ui.viewerShell.hidden=false;ui.clearBtn.disabled=false;ui.clearBtn.hidden=false;busy(true,'Öffne '+file.name+' …');setStatus('VERARBEITE '+type.toUpperCase());updateControls();
  try{const buffer=await fileBytes(file);if(generation!==state.generation)return;state.buffer=buffer;
    if(type==='pdf')await loadPdf(buffer,generation);
    else if(type==='docx')await loadDocx(buffer,generation);
    else if(['xlsx','xls','ods'].includes(type))await loadSpreadsheet(buffer,generation);
    else if(type==='pptx')await loadPptx(buffer,generation);
    else if(['epub','cbz','fb2','odp'].includes(type))await loadExtraDocument(buffer,type,generation);
    else if(type==='odt')await loadOdt(buffer,generation);
    else if(['png','jpg','jpeg','webp','gif','svg','bmp','avif'].includes(type))await loadImage(buffer,type,generation);
    else await loadText(buffer,type,generation);
    if(generation!==state.generation)return;setStatus('BEREIT · '+type.toUpperCase()+' · LOKAL');updateControls();
  }catch(err){if(generation!==state.generation)return;console.error('Dateifehler',err);resetSurface();showMessage((err&&err.message)||'Die Datei konnte nicht geöffnet werden.');setStatus('FEHLER · DATEI KONNTE NICHT GELESEN WERDEN');}finally{if(generation===state.generation)busy(false);}
}
async function loadPdf(buffer,gen){if(!window.pdfjsLib)throw Error('PDF-Bibliothek fehlt.');pdfjsLib.GlobalWorkerOptions.workerSrc='./pdf.worker.min.js';state.pdf=await pdfjsLib.getDocument({data:new Uint8Array(buffer.slice(0)),isEvalSupported:false}).promise;if(gen!==state.generation)return;state.pageCount=state.pdf.numPages;await renderPdfPage(gen);}
function capturePdfAnchor(){
 const old=ui.renderSurface.querySelector('canvas.pdf-page');
 if(!old||!old.clientWidth||!old.clientHeight)return null;
 const view=ui.viewerScroll;
 return {x:(view.scrollLeft+view.clientWidth/2-old.offsetLeft)/old.clientWidth,
         y:(view.scrollTop+view.clientHeight/2-old.offsetTop)/old.clientHeight};
}
function restorePdfAnchor(anchor,canvas){
 if(!anchor||!canvas)return;
 const view=ui.viewerScroll;
 view.scrollLeft=canvas.offsetLeft+anchor.x*canvas.clientWidth-view.clientWidth/2;
 view.scrollTop=canvas.offsetTop+anchor.y*canvas.clientHeight-view.clientHeight/2;
}
async function renderPdfPage(gen,keepPosition=false){
 if(!state.pdf||gen!==state.generation)return;
 const token=++state.renderToken, anchor=keepPosition?capturePdfAnchor():null;
 if(state.renderTask){try{state.renderTask.cancel();await state.renderTask.promise.catch(()=>{});}catch{}state.renderTask=null;}
 const page=await state.pdf.getPage(state.page);
 if(gen!==state.generation||token!==state.renderToken)return;
 const base=page.getViewport({scale:1});
 const available=Math.max(135,ui.viewerScroll.clientWidth-42);
 const fitScale=Math.min(2.8,available/base.width);
 const cssScale=fitScale*state.zoom;
 const cssViewport=page.getViewport({scale:cssScale});
 // Limit the actual bitmap allocation, but keep the CSS size and scrollable area.
 const requestedDpr=Math.min(window.devicePixelRatio||1,2);
 const area=cssViewport.width*cssViewport.height;
 const dpr=Math.max(.4,Math.min(requestedDpr,Math.sqrt(17e6/Math.max(1,area))));
 const viewport=page.getViewport({scale:cssScale*dpr});
 const canvas=el('canvas','pdf-page');
 canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
 canvas.style.width=cssViewport.width+'px';canvas.style.height=cssViewport.height+'px';
 resetSurface(false);ui.renderSurface.append(canvas);
 if(keepPosition)restorePdfAnchor(anchor,canvas);else ui.viewerScroll.scrollTo(0,0);
 state.renderTask=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport});
 const task=state.renderTask;
 try{await task.promise;}catch(e){if(e.name!=='RenderingCancelledException')throw e;}finally{if(state.renderTask===task)state.renderTask=null;}
 if(token===state.renderToken)updateControls();
}
async function loadDocx(buffer,gen){resetSurface();const wrap=el('div','docx-wrap');ui.renderSurface.append(wrap);if(!window.docx||typeof docx.renderAsync!=='function')throw Error('DOCX-Vorschau-Bibliothek fehlt.');
  try{await docx.renderAsync(buffer.slice(0),wrap,null,{className:'docx',inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false,useBase64URL:true,renderHeaders:true,renderFooters:true});}
  catch(e){console.warn('DOCX-Layoutfehler, Text-Fallback:',e);wrap.remove();if(!window.mammoth)throw Error('DOCX kann nicht gelesen werden: '+e.message);const result=await mammoth.extractRawText({arrayBuffer:buffer.slice(0)});const text=el('article','doc-text',result.value||'(Leeres Dokument)');ui.renderSurface.append(text);showMessage('DOCX-Layout nicht verfügbar – Textansicht geöffnet.',false);}
  if(gen!==state.generation)return;const sections=wrap.querySelectorAll('section.docx');state.pageCount=Math.max(1,sections.length);state.page=1;updateControls();}
function sheetData(wb,idx){const ws=wb.Sheets[wb.SheetNames[idx]];return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});}
function showSheet(){resetSurface();const outer=el('div','sheet-card');outer.style.zoom=String(state.zoom);const tabs=el('nav','sheet-tabs');tabs.setAttribute('aria-label','Tabellenblätter');state.wb.SheetNames.forEach((name,idx)=>{const btn=el('button',idx===state.sheetIndex?'selected':'',name);btn.type='button';btn.addEventListener('click',()=>{state.sheetIndex=idx;state.page=idx+1;showSheet();});tabs.append(btn);});outer.append(tabs);
  const rows=sheetData(state.wb,state.sheetIndex);const MAX_ROWS=1600,MAX_COLS=60;const viewRows=rows.slice(0,MAX_ROWS);const wrap=el('div','sheet-table-wrap');const table=el('table','sheet-table');const thead=el('thead');const headings=el('tr');const maxcol=Math.min(MAX_COLS,Math.max(1,...viewRows.map(r=>r.length)));headings.append(el('th','', '#'));for(let c=0;c<maxcol;c++)headings.append(el('th','',XLSX.utils.encode_col(c)));thead.append(headings);table.append(thead);
  const tbody=el('tbody');viewRows.forEach((row,ridx)=>{const tr=el('tr');tr.append(el('th','',ridx+1));for(let c=0;c<maxcol;c++)tr.append(el('td','',row[c]??''));tbody.append(tr);});table.append(tbody);wrap.append(table);outer.append(wrap);
  if(rows.length>MAX_ROWS||rows.some(r=>r.length>MAX_COLS))outer.append(el('p','sheet-note',`Vorschau auf ${MAX_ROWS} Zeilen × ${MAX_COLS} Spalten begrenzt – Originaldatei bleibt unverändert.`));
  ui.renderSurface.append(outer);updateControls();}
async function loadSpreadsheet(buffer,gen){if(!window.XLSX)throw Error('Tabellenbibliothek fehlt.');state.wb=XLSX.read(new Uint8Array(buffer),{type:'array',cellDates:true});if(gen!==state.generation)return;if(!state.wb.SheetNames.length)throw Error('Die Arbeitsmappe enthält keine Tabellenblätter.');state.page=1;state.pageCount=state.wb.SheetNames.length;state.sheetIndex=0;showSheet();}
const NS={p:'http://schemas.openxmlformats.org/presentationml/2006/main',a:'http://schemas.openxmlformats.org/drawingml/2006/main',r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',rel:'http://schemas.openxmlformats.org/package/2006/relationships'};
const firstNS=(node,ns,local)=>node.getElementsByTagNameNS(ns,local)[0]||null;
const allNS=(node,ns,local)=>Array.from(node.getElementsByTagNameNS(ns,local));
const parseXml=xml=>{const dom=new DOMParser().parseFromString(xml,'application/xml');if(dom.getElementsByTagName('parsererror').length)throw Error('Ungültiges XML im Dokument.');return dom;};
const joinZipPath=(base,target)=>{const parts=(base+'/'+target.replace(/^\//,'')).split('/');const out=[];for(const p of parts){if(!p||p==='.')continue;if(p==='..'){out.pop();continue;}out.push(p);}return out.join('/');};
async function loadZip(buffer){if(!window.JSZip)throw Error('ZIP-Bibliothek fehlt.');const zip=await JSZip.loadAsync(buffer);assertZipReasonable(zip);return zip;}
// PPTX native OpenXML preview: colored shapes, runs, bullet lists, images, tables, backgrounds, rotations.
const directNS=(node,ns,name)=>Array.from(node?.children||[]).find(ch=>ch.namespaceURI===ns&&ch.localName===name)||null;
const directElements=node=>Array.from(node?.children||[]);
const numeric=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const fontPx=(hundredths,slideWidth)=>Math.max(5,Math.min(130,(Number(hundredths||1800)/100)*(slideWidth/(state.slideSize[0]/12700))));
function pptColor(element,theme=state.pptTheme){
 if(!element)return null;
 const rgb=firstNS(element,NS.a,'srgbClr');
 const sys=firstNS(element,NS.a,'sysClr');
 const scheme=firstNS(element,NS.a,'schemeClr');
 let raw=rgb?.getAttribute('val')||sys?.getAttribute('lastClr')||null;
 if(!raw&&scheme){const key=scheme.getAttribute('val');raw=(theme||{})[key]||({tx1:'000000',bg1:'FFFFFF',tx2:'444444',bg2:'EEEEEE',accent1:'488DF6',accent2:'A969F7'}[key]);}
 if(!raw||!/^[\da-f]{6}$/i.test(raw))return null;
 const source=rgb||sys||scheme;const alpha=firstNS(source,NS.a,'alpha');
 return alpha?`rgba(${parseInt(raw.slice(0,2),16)},${parseInt(raw.slice(2,4),16)},${parseInt(raw.slice(4,6),16)},${Math.max(0,Math.min(1,numeric(alpha.getAttribute('val'),100000)/100000))})`:'#'+raw;
}
function pptFill(parent){
 if(!parent||directNS(parent,NS.a,'noFill'))return 'transparent';
 const fill=directNS(parent,NS.a,'solidFill');
 if(fill)return pptColor(fill);
 const grad=directNS(parent,NS.a,'gradFill');
 if(grad){
  const stops=allNS(grad,NS.a,'gs').map(n=>({pos:numeric(n.getAttribute('pos'))/1000,color:pptColor(n)})).filter(n=>n.color);
  if(stops.length>=2){
   const angle=numeric(firstNS(grad,NS.a,'lin')?.getAttribute('ang'),5400000)/60000;
   return `linear-gradient(${angle}deg,${stops.map(s=>s.color+' '+s.pos+'%').join(',')})`;
  }
 }
 return null;
}
function pptRelationships(zip,path){
 const name=path.slice(path.lastIndexOf('/')+1);const dir=path.slice(0,path.lastIndexOf('/'));
 const relPath=dir+'/_rels/'+name+'.rels';const file=zip.file(relPath);
 if(!file)return Promise.resolve({});
 return file.async('text').then(xml=>{const rels={};for(const rel of allNS(parseXml(xml),NS.rel,'Relationship')){
  const id=rel.getAttribute('Id'),target=rel.getAttribute('Target'),mode=rel.getAttribute('TargetMode');
  if(id&&target&&mode!=='External'&&!/^(https?:|data:|file:|javascript:)/i.test(target))rels[id]=joinZipPath(dir,target);
 }return rels;});
}
function effectiveXfrm(node){
 const props=directNS(node,NS.p,'spPr')||directNS(node,NS.p,'grpSpPr')||directNS(node,NS.p,'xfrm')||node;
 const xfrm=directNS(props,NS.a,'xfrm')||directNS(props,NS.p,'xfrm')||firstNS(props,NS.a,'xfrm');
 if(!xfrm)return null;
 const off=directNS(xfrm,NS.a,'off'),sz=directNS(xfrm,NS.a,'ext');
 if(!off||!sz)return null;
 return {x:numeric(off.getAttribute('x')),y:numeric(off.getAttribute('y')),w:numeric(sz.getAttribute('cx')),h:numeric(sz.getAttribute('cy')),r:numeric(xfrm.getAttribute('rot'))/60000,xfrm};
}
function mapPptRect(rect,group){
 if(!rect)return null;
 if(!group)return [rect.x,rect.y,rect.w,rect.h];
 return [group.x+(rect.x-group.cx)*group.sx,group.y+(rect.y-group.cy)*group.sy,rect.w*group.sx,rect.h*group.sy];
}
function placePpt(node,rect,group){
 const box=mapPptRect(rect,group);if(!box)return false;
 const [x,y,w,h]=box;if(w<=0||h<=0)return false;
 node.style.left=(x/state.slideSize[0]*100)+'%';node.style.top=(y/state.slideSize[1]*100)+'%';
 node.style.width=(w/state.slideSize[0]*100)+'%';node.style.height=(h/state.slideSize[1]*100)+'%';
 if(rect?.r)node.style.transform=`rotate(${rect.r}deg)`;
 return true;
}
function readPptText(shape,slideWidth){
 const body=directNS(shape,NS.p,'txBody');if(!body)return null;
 const content=el('div','ppt-text');const bodyPr=directNS(body,NS.a,'bodyPr');
 const inset=key=>numeric(bodyPr?.getAttribute(key),91440)/state.slideSize[0]*slideWidth;
 content.style.padding=`${inset('tIns')}px ${inset('rIns')}px ${inset('bIns')}px ${inset('lIns')}px`;
 content.style.width='100%';content.style.height='100%';content.style.overflow='hidden';
 const vertical=bodyPr?.getAttribute('anchor');
 if(vertical==='t')content.style.marginTop='0';
 else if(vertical==='b')content.style.display='flex',content.style.flexDirection='column',content.style.justifyContent='flex-end';
 else if(vertical==='ctr')content.style.display='flex',content.style.flexDirection='column',content.style.justifyContent='center';
 for(const para of Array.from(body.children).filter(c=>c.namespaceURI===NS.a&&c.localName==='p')){
  const p=el('p');const prop=directNS(para,NS.a,'pPr');
  const alg=prop?.getAttribute('algn');if(alg)p.style.textAlign={ctr:'center',r:'right',just:'justify',l:'left'}[alg]||'left';
  const before=directNS(prop,NS.a,'buChar');if(before)p.append(el('span','ppt-bullet',(before.getAttribute('char')||'•')+' '));
  for(const r of directElements(para)){
   if(r.namespaceURI!==NS.a)continue;
   if(r.localName==='br'){p.append(document.createElement('br'));continue;}
   if(!['r','fld'].includes(r.localName))continue;
   const textNode=directNS(r,NS.a,'t');if(!textNode)continue;
   const span=el('span','',textNode.textContent);
   const runProp=directNS(r,NS.a,'rPr');
   const defaults=directNS(para,NS.a,'endParaRPr');
   const propToUse=runProp||defaults;
   span.style.fontSize=fontPx(propToUse?.getAttribute('sz')||1800,slideWidth)+'px';
   if(propToUse?.getAttribute('b')==='1')span.style.fontWeight='700';
   if(propToUse?.getAttribute('i')==='1')span.style.fontStyle='italic';
   if(propToUse?.getAttribute('u')&&propToUse.getAttribute('u')!=='none')span.style.textDecoration='underline';
   const solid=directNS(propToUse,NS.a,'solidFill');const color=pptColor(solid);
   if(color)span.style.color=color;
   const family=directNS(propToUse,NS.a,'latin')?.getAttribute('typeface');
   if(family&&/^[\w\s-]{1,50}$/.test(family))span.style.fontFamily=family+',sans-serif';
   p.append(span);
  }
  if(!p.childNodes.length)p.append('\u00a0');
  content.append(p);
 }
 return content;
}
async function pptThemeColors(zip){
 const file=zip.file('ppt/theme/theme1.xml');if(!file)return {};
 const xml=parseXml(await file.async('text'));const scheme=firstNS(xml,NS.a,'clrScheme');const out={};
 if(!scheme)return out;
 for(const ch of directElements(scheme)){
  const srgb=firstNS(ch,NS.a,'srgbClr')?.getAttribute('val');
  const sys=firstNS(ch,NS.a,'sysClr')?.getAttribute('lastClr');const val=srgb||sys;
  if(val&&/^[\da-f]{6}$/i.test(val))out[ch.localName]=val;
 }
 out.tx1=out.dk1||'000000';out.bg1=out.lt1||'FFFFFF';out.tx2=out.dk2||'444444';out.bg2=out.lt2||'EEEEEE';
 return out;
}
async function loadPptx(buffer,gen){
 state.slideZip=await loadZip(buffer);const zip=state.slideZip;
 const paths=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
 if(!paths.length)throw Error('Die Präsentation enthält keine lesbaren Folien.');
 state.slidePaths=paths;state.pageCount=paths.length;state.pptTheme=await pptThemeColors(zip);
 const file=zip.file('ppt/presentation.xml');if(file){const xml=parseXml(await file.async('text'));const size=firstNS(xml,NS.p,'sldSz');if(size)state.slideSize=[numeric(size.getAttribute('cx'),12192000),numeric(size.getAttribute('cy'),6858000)];}
 if(gen!==state.generation)return;
 await showPptSlide(gen);
}
async function showPptSlide(gen,keepPosition=false){
 if(gen!==state.generation||!state.slideZip)return;
 const token=++state.renderToken;cleanupUrls();
 const zip=state.slideZip,path=state.slidePaths[state.page-1];
 const xml=parseXml(await zip.file(path).async('text'));
 const rels=await pptRelationships(zip,path);if(gen!==state.generation||token!==state.renderToken)return;
 const baseWidth=Math.min(1020,Math.max(220,ui.viewerScroll.clientWidth-36));
 const slideWidth=baseWidth*state.zoom;
 const slide=el('section','ppt-slide');slide.setAttribute('aria-label',`Folie ${state.page}`);
 slide.style.aspectRatio=`${state.slideSize[0]}/${state.slideSize[1]}`;slide.style.width=slideWidth+'px';
 // Preserve white background, apply slide background solid fill when present.
 const slideBg=firstNS(xml,NS.p,'bg');const bgPr=slideBg&&directNS(slideBg,NS.p,'bgPr');
 const fill=bgPr&&pptFill(bgPr);if(fill)slide.style.background=fill;
 const spTree=firstNS(xml,NS.p,'spTree');
 async function renderChild(node,group=null){
  if(gen!==state.generation||token!==state.renderToken)return;
  if(node.namespaceURI!==NS.p)return;
  const kind=node.localName;
  if(kind==='grpSp'){
   const xfrm=effectiveXfrm(node);
   if(!xfrm)return;
   const cOff=directNS(xfrm.xfrm,NS.a,'chOff'),cExt=directNS(xfrm.xfrm,NS.a,'chExt');
   const rect=mapPptRect(xfrm,group);
   if(!rect)return;
   const scaleX=rect[2]/Math.max(1,numeric(cExt?.getAttribute('cx'),xfrm.w));
   const scaleY=rect[3]/Math.max(1,numeric(cExt?.getAttribute('cy'),xfrm.h));
   const childGroup={x:rect[0],y:rect[1],cx:numeric(cOff?.getAttribute('x')),cy:numeric(cOff?.getAttribute('y')),sx:scaleX,sy:scaleY};
   for(const child of directElements(node))if(child.localName!=='nvGrpSpPr'&&child.localName!=='grpSpPr')await renderChild(child,childGroup);
   return;
  }
  if(kind==='sp'||kind==='cxnSp'){
   const rect=effectiveXfrm(node);if(!rect)return;
   const props=directNS(node,NS.p,'spPr');
   const geom=directNS(props,NS.a,'prstGeom')?.getAttribute('prst')||'rect';
   if(kind==='cxnSp'||geom==='line'){
    const line=el('div','ppt-line');if(!placePpt(line,rect,group))return;
    const border=directNS(props,NS.a,'ln');const color=pptColor(directNS(border,NS.a,'solidFill'))||'#444';
    const width=Math.max(1,numeric(border?.getAttribute('w'),12700)/12700*slideWidth/(state.slideSize[0]/12700));
    line.style.borderTop=`${width}px solid ${color}`;slide.append(line);return;
   }
   const shape=el('div','ppt-shape');if(!placePpt(shape,rect,group))return;
   const bg=pptFill(props);if(bg)shape.style.background=bg;
   if(geom==='ellipse')shape.style.borderRadius='50%';
   if(geom==='roundRect')shape.style.borderRadius='8%';
   const outlines={triangle:'polygon(50% 0,100% 100%,0 100%)',rtTriangle:'polygon(0 0,100% 100%,0 100%)',diamond:'polygon(50% 0,100% 50%,50% 100%,0 50%)',hexagon:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',chevron:'polygon(0 0,75% 0,100% 50%,75% 100%,0 100%,25% 50%)',parallelogram:'polygon(25% 0,100% 0,75% 100%,0 100%)',trapezoid:'polygon(20% 0,80% 0,100% 100%,0 100%)',pentagon:'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)',rightArrow:'polygon(0 25%,67% 25%,67% 0,100% 50%,67% 100%,67% 75%,0 75%)'};
   if(outlines[geom])shape.style.clipPath=outlines[geom];
   const border=directNS(props,NS.a,'ln');if(border&&!directNS(border,NS.a,'noFill')){
    const color=pptColor(directNS(border,NS.a,'solidFill'));if(color){shape.style.borderColor=color;shape.style.borderStyle='solid';shape.style.borderWidth=Math.max(1,numeric(border.getAttribute('w'),12700)/12700*slideWidth/(state.slideSize[0]/12700))+'px';}
   }
   const body=readPptText(node,slideWidth);if(body)shape.append(body);
   slide.append(shape);return;
  }
  if(kind==='pic'){
   const rect=effectiveXfrm(node);const blip=firstNS(node,NS.a,'blip');const id=blip?.getAttributeNS(NS.r,'embed');const media=rels[id];
   if(!rect||!media||!zip.file(media))return;
   const type=/\.png$/i.test(media)?'image/png':/\.jpe?g$/i.test(media)?'image/jpeg':/\.gif$/i.test(media)?'image/gif':/\.webp$/i.test(media)?'image/webp':null;
   if(!type)return;
   const holder=el('div','ppt-picture');if(!placePpt(holder,rect,group))return;
   const data=await zip.file(media).async('blob');if(gen!==state.generation||token!==state.renderToken)return;
   const img=el('img');img.src=createBlobUrl(new Blob([data],{type}));img.alt='Folienbild';holder.append(img);slide.append(holder);return;
  }
  if(kind==='graphicFrame'){
   const rect=effectiveXfrm(node);if(!rect)return;
   const tbl=firstNS(node,NS.a,'tbl');
   if(tbl){const table=el('table','ppt-table');if(!placePpt(table,rect,group))return;
    for(const row of allNS(tbl,NS.a,'tr')){const tr=el('tr');for(const cell of directElements(row).filter(c=>c.localName==='tc')){
      const td=el('td','',allNS(cell,NS.a,'t').map(t=>t.textContent).join(''));tr.append(td);
    }table.append(tr);}slide.append(table);
   }else{const holder=el('div','ppt-shape','Diagramm / SmartArt – Vorschau eingeschränkt');if(placePpt(holder,rect,group)){holder.style.border='1px dashed #7c8cb3';holder.style.padding='6px';slide.append(holder);}}
  }
 }
 if(spTree){for(const child of directElements(spTree))await renderChild(child);}
 if(!slide.childElementCount)slide.append(el('p','slide-fallback','Diese Folie enthält keine unterstützten Elemente.'));
 if(gen!==state.generation||token!==state.renderToken)return;
 const viewer=ui.viewerScroll;
 const old=ui.renderSurface.firstElementChild;
 const cx=keepPosition&&old?.clientWidth?(viewer.scrollLeft+viewer.clientWidth/2-old.offsetLeft)/old.clientWidth:null;
 const cy=keepPosition&&old?.clientHeight?(viewer.scrollTop+viewer.clientHeight/2-old.offsetTop)/old.clientHeight:null;
 resetSurface(false);ui.renderSurface.append(slide);
 if(cx!==null){viewer.scrollLeft=slide.offsetLeft+cx*slide.clientWidth-viewer.clientWidth/2;viewer.scrollTop=slide.offsetTop+cy*slide.clientHeight-viewer.clientHeight/2;}else viewer.scrollTo(0,0);
 updateControls();
}

async function loadOdt(buffer,gen){const zip=await loadZip(buffer);const content=zip.file('content.xml');if(!content)throw Error('ODT enthält keine content.xml.');const xml=parseXml(await content.async('text'));if(gen!==state.generation)return;resetSurface();const article=el('article','odt-document');const nsText='urn:oasis:names:tc:opendocument:xmlns:text:1.0';const nodes=Array.from(xml.getElementsByTagNameNS(nsText,'p')).concat(Array.from(xml.getElementsByTagNameNS(nsText,'h')));nodes.sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING?1:-1);for(const n of nodes){const heading=n.localName==='h';const tag=heading?'h2':'p';const text=n.textContent.trim();if(text)article.append(el(tag,'',text));}if(!article.childNodes.length)article.append(el('p','','Kein Text gefunden.'));ui.renderSurface.append(article);}
async function loadImage(buffer,type,gen){resetSurface();let mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',bmp:'image/bmp',avif:'image/avif'}[type];if(type==='svg'){const source=new TextDecoder().decode(buffer);if(/<script|\son\w+\s*=|<foreignObject|(?:https?:|data:)\/\//i.test(source))throw Error('SVG mit potenziell aktiven Inhalten wird aus Sicherheitsgründen nicht angezeigt.');}const url=createBlobUrl(new Blob([buffer],{type:mime}));const img=el('img','image-preview');img.src=url;img.alt=state.file.name;ui.renderSurface.append(img);if(gen!==state.generation)return;}
function parseCsv(text,forcedDelimiter=null){const sample=text.split(/\r?\n/).slice(0,5).join('\n');const counts={',':(sample.match(/,/g)||[]).length,';':(sample.match(/;/g)||[]).length,'\t':(sample.match(/\t/g)||[]).length};const delim=forcedDelimiter||Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delim&&!quoted){row.push(cell);cell='';}else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
async function loadText(buffer,type,gen){const txt=new TextDecoder('utf-8',{fatal:false}).decode(buffer);if(gen!==state.generation)return;resetSurface();if(type==='csv'||type==='tsv'){const wb={SheetNames:['CSV'],Sheets:{}};const rows=parseCsv(txt,type==='tsv'?'\t':null);const outer=el('div','sheet-card');const table=el('table','sheet-table');const tbody=el('tbody');for(const row of rows.slice(0,1600)){const tr=el('tr');for(const value of row.slice(0,60))tr.append(el('td','',value));tbody.append(tr);}table.append(tbody);const wrap=el('div','sheet-table-wrap');wrap.append(table);outer.append(wrap);ui.renderSurface.append(outer);return;}if(['md','markdown'].includes(type)){renderMarkdown(txt);return;}
  if(['ics','vcf','eml'].includes(type)){renderStructuredText(txt,type);return;}
  if(type==='rtf'){renderRtf(txt);return;}
  let data=txt;if(type==='json'){try{data=JSON.stringify(JSON.parse(txt),null,2);}catch{showMessage('JSON ist nicht gültig – Rohtext wird angezeigt.',false);}}if(type==='html'||type==='htm'||type==='xml')showMessage('HTML/XML wird sicher als Quelltext gezeigt, nicht ausgeführt.',false);const node=el('pre','doc-text',data||'(Leere Datei)');ui.renderSurface.append(node);}
// Additional locally rendered formats: EPUB/CBZ/FB2/ODP, Markdown, event/contact/mail files.
async function loadExtraDocument(buffer,type,gen){
 if(type==='fb2')return renderFb2(new TextDecoder('utf-8').decode(buffer));
 const zip=await loadZip(buffer);if(gen!==state.generation)return;state.openZip=zip;
 if(type==='cbz'){
  const pages=Object.keys(zip.files).filter(name=>!zip.files[name].dir&&/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name));
  pages.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
  if(!pages.length)throw Error('Im Comic-Archiv wurden keine Bilder gefunden.');
  state.comicPages=pages;state.pageCount=pages.length;await showComicPage(gen);return;
 }
 if(type==='epub'){
  const container=zip.file('META-INF/container.xml');if(!container)throw Error('EPUB enthält keine container.xml.');
  const root=parseXml(await container.async('text'));
  const fullPath=Array.from(root.getElementsByTagName('*')).find(n=>n.localName==='rootfile')?.getAttribute('full-path');
  if(!fullPath||!zip.file(fullPath))throw Error('EPUB-Paketdatei fehlt.');
  const pack=parseXml(await zip.file(fullPath).async('text'));
  const base=fullPath.split('/').slice(0,-1).join('/');
  const items={};for(const n of Array.from(pack.getElementsByTagName('*')).filter(n=>n.localName==='item')){
   items[n.getAttribute('id')]={path:joinZipPath(base,n.getAttribute('href')||''),media:n.getAttribute('media-type')||''};
  }
  const spine=Array.from(pack.getElementsByTagName('*')).filter(n=>n.localName==='itemref');
  state.bookChapters=spine.map(n=>items[n.getAttribute('idref')]).filter(i=>i&&zip.file(i.path)&&/xhtml|html/i.test(i.media)).slice(0,500);
  if(!state.bookChapters.length)throw Error('EPUB enthält keine lesbaren Kapitel.');
  state.pageCount=state.bookChapters.length;await showEpubChapter(gen);return;
 }
 if(type==='odp'){
  const entry=zip.file('content.xml');if(!entry)throw Error('ODP enthält keine content.xml.');
  const dom=parseXml(await entry.async('text'));
  state.odpPages=Array.from(dom.getElementsByTagName('*')).filter(n=>n.localName==='page'&&n.namespaceURI==='urn:oasis:names:tc:opendocument:xmlns:drawing:1.0');
  if(!state.odpPages.length)throw Error('ODP enthält keine Folien.');
  state.odpStyles={};
  const styleFile=zip.file('styles.xml');const styleDom=styleFile?parseXml(await styleFile.async('text')):null;
  for(const tree of [styleDom,dom]){
   if(!tree)continue;
   for(const element of Array.from(tree.getElementsByTagName('*')).filter(n=>n.localName==='style')){
    const id=element.getAttribute('style:name')||element.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:style:1.0','name');
    if(id)state.odpStyles[id]=element;
   }
  }
  state.odpWidthPx=1058;state.odpHeightPx=595;
  if(styleDom){
   const props=Array.from(styleDom.getElementsByTagName('*')).filter(n=>n.localName==='page-layout-properties');
   const landscape=props.map(n=>({w:odfUnit(n.getAttribute('fo:page-width')),h:odfUnit(n.getAttribute('fo:page-height'))})).find(x=>x.w>x.h&&x.w>500);
   if(landscape){state.odpWidthPx=landscape.w;state.odpHeightPx=landscape.h;}
  }
  state.pageCount=state.odpPages.length;
  await showOdpSlide(gen);
 }
}
async function showComicPage(gen){
 if(gen!==state.generation||!state.openZip)return;
 cleanupUrls();const path=state.comicPages[state.page-1];const imgBytes=await state.openZip.file(path).async('blob');
 if(gen!==state.generation)return;
 const extension=ext(path);const types={jpg:'jpeg',jpeg:'jpeg',png:'png',webp:'webp',gif:'gif',bmp:'bmp',avif:'avif'};
 const img=el('img','comic-image');img.alt=path;img.src=createBlobUrl(new Blob([imgBytes],{type:'image/'+types[extension]}));
 img.style.width=Math.max(200,Math.min(980,ui.viewerScroll.clientWidth-40))+'px';img.style.zoom=String(state.zoom);
 resetSurface();ui.renderSurface.append(img);
}
const allowedBookTags=new Set(['P','H1','H2','H3','H4','H5','H6','DIV','SPAN','EM','I','STRONG','B','UL','OL','LI','BLOCKQUOTE','PRE','CODE','BR','HR','TABLE','TR','TD','TH','IMG']);
async function showEpubChapter(gen){
 if(gen!==state.generation||!state.openZip)return;
 cleanupUrls();const info=state.bookChapters[state.page-1];const zip=state.openZip;
 const xml=await zip.file(info.path).async('text');if(gen!==state.generation)return;
 // Parser is intentionally inert. Never append arbitrary EPUB DOM nodes to the live document.
 const parsed=new DOMParser().parseFromString(xml,'text/html');const content=parsed.querySelector('body')||parsed.documentElement;
 const out=el('article','ebook-reader');out.style.zoom=String(state.zoom);
 const makeSafe=async (input,parent,depth=0)=>{
  if(depth>100)return;
  for(const node of Array.from(input.childNodes)){
   if(node.nodeType===3){parent.append(document.createTextNode(node.nodeValue||''));continue;}
   if(node.nodeType!==1)continue;
   const tag=node.nodeName.toUpperCase();if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','FORM','NOSCRIPT','TEMPLATE'].includes(tag))continue;
   if(tag==='IMG'){
    const src=node.getAttribute('src')||'';
    if(/^(https?:|data:|javascript:|\/\/)/i.test(src))continue;
    const imagePath=joinZipPath(info.path.split('/').slice(0,-1).join('/'),src.split('#')[0].split('?')[0]);
    if(!zip.file(imagePath)||!/\.(jpe?g|png|gif|webp)$/i.test(imagePath))continue;
    const data=await zip.file(imagePath).async('blob');
    const img=el('img');img.alt=node.getAttribute('alt')||'Buchbild';img.src=createBlobUrl(data);parent.append(img);continue;
   }
   const element=el(allowedBookTags.has(tag)?tag.toLowerCase():'span');
   parent.append(element);await makeSafe(node,element,depth+1);
  }
 };
 await makeSafe(content,out);if(gen!==state.generation)return;
 resetSurface();ui.renderSurface.append(out);updateControls();
}
function renderFb2(txt){
 const dom=parseXml(txt);const root=dom.documentElement;
 const reader=el('article','ebook-reader');
 for(const sec of Array.from(root.getElementsByTagName('*')).filter(e=>e.localName==='section').slice(0,500)){
  const title=Array.from(sec.children).find(ch=>ch.localName==='title');
  if(title)reader.append(el('h2','chapter-heading',title.textContent.trim()));
  for(const child of Array.from(sec.children).filter(n=>['p','subtitle','empty-line'].includes(n.localName))){
   if(child.localName==='empty-line')reader.append(el('br'));
   else reader.append(el(child.localName==='subtitle'?'h3':'p','',child.textContent));
  }
 }
 if(!reader.childNodes.length)reader.append(el('p','',root.textContent.slice(0,100000)));
 resetSurface();ui.renderSurface.append(reader);
}
const odfAttr=(node,name,ns='http://www.w3.org/2000/svg')=>node?.getAttributeNS(ns,name)||node?.getAttribute('svg:'+name);
const odfUnit=value=>{const match=String(value||'').match(/^([\d.]+)(cm|mm|in|pt|px)?$/);if(!match)return 0;return parseFloat(match[1])*({cm:37.795,mm:3.7795,in:96,pt:1.333,px:1}[match[2]||'px']);};
function odpStyleProps(name,kind='graphic-properties'){
 const style=state.odpStyles?.[name];
 return style?Array.from(style.children).find(n=>n.localName===kind):null;
}
async function showOdpSlide(gen){
 if(gen!==state.generation)return;const token=++state.renderToken;cleanupUrls();
 const page=state.odpPages?.[state.page-1];if(!page)return;
 const width=Math.min(1020,Math.max(200,ui.viewerScroll.clientWidth-36))*state.zoom;
 const slide=el('section','ppt-slide');slide.style.width=width+'px';slide.style.aspectRatio=`${state.odpWidthPx}/${state.odpHeightPx}`;
 const drawingNs='urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
 const xlinkNs='http://www.w3.org/1999/xlink';
 const pageStyle=odpStyleProps(page.getAttribute('draw:style-name'),'drawing-page-properties');
 const bg=pageStyle?.getAttribute('draw:fill-color');if(bg&&/^#[0-9a-f]{6}$/i.test(bg))slide.style.background=bg;
 const elements=Array.from(page.getElementsByTagName('*')).filter(n=>n.namespaceURI===drawingNs&&['frame','rect','ellipse','line','custom-shape'].includes(n.localName));
 for(const element of elements){
  const x=odfUnit(odfAttr(element,'x')),y=odfUnit(odfAttr(element,'y'));
  const w=odfUnit(odfAttr(element,'width')),h=odfUnit(odfAttr(element,'height'));
  if(!w||!h)continue;
  const shape=el('div','ppt-shape');shape.style.left=x/state.odpWidthPx*100+'%';shape.style.top=y/state.odpHeightPx*100+'%';
  shape.style.width=w/state.odpWidthPx*100+'%';shape.style.height=h/state.odpHeightPx*100+'%';
  const style=odpStyleProps(element.getAttribute('draw:style-name'));
  const fill=style?.getAttribute('draw:fill-color');if(fill&&/^#[0-9a-f]{6}$/i.test(fill))shape.style.background=fill;
  const stroke=style?.getAttribute('svg:stroke-color');if(stroke&&/^#[0-9a-f]{6}$/i.test(stroke))shape.style.border='1px solid '+stroke;
  const geom=Array.from(element.children).find(ch=>ch.localName==='enhanced-geometry')?.getAttribute('draw:type')||'';
  if(element.localName==='ellipse'||/ellipse|oval/i.test(geom))shape.style.borderRadius='50%';
  if(/round/i.test(geom))shape.style.borderRadius='8%';
  const parts=Array.from(element.getElementsByTagName('*')).filter(n=>n.localName==='p');
  for(const part of parts){
   const paragraph=el('p');paragraph.style.padding='1% 2%';paragraph.style.margin='0';
   const nodes=Array.from(part.getElementsByTagName('*')).filter(n=>n.localName==='span');
   if(nodes.length){for(const n of nodes){const span=el('span','',n.textContent);const props=odpStyleProps(n.getAttribute('text:style-name'),'text-properties');
     const fontsize=props?.getAttribute('fo:font-size');if(fontsize)span.style.fontSize=(odfUnit(fontsize)*width/state.odpWidthPx)+'px';
     const color=props?.getAttribute('fo:color');if(color&&/^#[0-9a-f]{6}$/i.test(color))span.style.color=color;
     if(props?.getAttribute('fo:font-weight')==='bold')span.style.fontWeight='700';paragraph.append(span);}}
   else paragraph.textContent=part.textContent;
   shape.append(paragraph);
  }
  const image=Array.from(element.getElementsByTagName('*')).find(n=>n.localName==='image');
  const href=image?.getAttributeNS(xlinkNs,'href');
  if(href&&!href.includes('..')&&state.openZip.file(href)&&/\.(png|jpe?g|webp|gif)$/i.test(href)){
   const blob=await state.openZip.file(href).async('blob');if(gen!==state.generation||token!==state.renderToken)return;
   const img=el('img');img.alt='Folienbild';img.src=createBlobUrl(blob);shape.classList.add('ppt-picture');shape.append(img);
  }
  slide.append(shape);
 }
 if(!slide.childNodes.length){const txt=Array.from(page.getElementsByTagName('*')).filter(n=>n.localName==='p').map(n=>n.textContent).join('\n');slide.append(el('div','slide-fallback',txt||'Folie ohne unterstützte Inhalte'));}
 if(gen!==state.generation||token!==state.renderToken)return;
 resetSurface();ui.renderSurface.append(slide);updateControls();
}
function renderMarkdown(source){
 const doc=el('article','structured-doc');const lines=source.split(/\r?\n/);let list=null,code=null;
 for(const line of lines.slice(0,10000)){
  if(/^\s*```/.test(line)){if(code){doc.append(code);code=null;}else code=el('pre');continue;}
  if(code){code.append(document.createTextNode(line+'\n'));continue;}
  const head=line.match(/^\s*(#{1,6})\s+(.+)$/);
  if(head){list=null;doc.append(el('h'+head[1].length,'',head[2]));continue;}
  const bullet=line.match(/^\s*([-*+]\s+|\d+\.\s+)(.*)$/);
  if(bullet){const kind=/\d/.test(bullet[1][0])?'ol':'ul';if(!list||list.tagName.toLowerCase()!==kind){list=el(kind);doc.append(list);}list.append(el('li','',bullet[2]));continue;}
  list=null;if(/^>\s?/.test(line)){doc.append(el('blockquote','',line.replace(/^>\s?/,'')));continue;}
  if(line.trim())doc.append(el('p','',line));
 }
 if(code)doc.append(code);resetSurface();ui.renderSurface.append(doc);
}
function unfoldedLines(text){return text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/);}
function renderStructuredText(source,type){
 const doc=el('article','structured-doc');
 if(type==='eml'){
  const split=source.search(/\r?\n\r?\n/);const header=split>=0?source.slice(0,split):source;const body=split>=0?source.slice(split).replace(/^\r?\n\r?\n/,''):'';
  const unfolded=unfoldedLines(header);const allowed=['from','to','cc','subject','date','reply-to'];
  for(const line of unfolded){const m=line.match(/^([\w-]+):\s*(.+)$/);if(m&&allowed.includes(m[1].toLowerCase())){
   const row=el('div','key-value');row.append(el('b','',m[1]),el('span','',m[2]));doc.append(row);
  }}
  const encoding=unfolded.find(line=>/^Content-Transfer-Encoding:/i.test(line))||'';
  let preview=body;
  if(/quoted-printable/i.test(encoding)){preview=body.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_,x)=>String.fromCharCode(parseInt(x,16)));}
  if(/base64/i.test(encoding)){try{const binary=atob(body.replace(/\s+/g,''));preview=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{preview='(Base64-Text konnte nicht gelesen werden.)';}}
  const multipart=/Content-Type:\s*multipart\//i.test(header);if(multipart)doc.append(el('p','','Mehrteilige E-Mail: nur sichere Textvorschau; Anhänge werden nicht ausgeführt.'));
  doc.append(el('pre','',preview.slice(0,250000)));return resetSurface(),ui.renderSurface.append(doc);
 }
 if(type==='ics'||type==='vcf'){
  const groups=type==='ics'?['VEVENT','VTODO']:['VCARD'];
  let current=null,items=[];
  for(const line of unfoldedLines(source)){
   const begin=line.match(/^BEGIN:(.+)/i),end=line.match(/^END:(.+)/i);
   if(begin&&groups.includes(begin[1].toUpperCase())){current=[];continue;}
   if(end&&current){items.push(current);current=null;continue;}
   if(current){const parts=line.match(/^([^:]+):(.*)$/);if(parts)current.push([parts[1].split(';')[0].toUpperCase(),parts[2].replace(/\\n/gi,'\n')]);}
  }
  if(!items.length)doc.append(el('p','','Keine Einträge erkannt.'));
  const labels={SUMMARY:'Titel',DESCRIPTION:'Beschreibung',DTSTART:'Beginn',DTEND:'Ende',LOCATION:'Ort',NAME:'Name',FN:'Name',TEL:'Telefon',EMAIL:'E-Mail',ORG:'Organisation',URL:'Website',DUE:'Fällig'};
  for(const [i,item] of items.slice(0,500).entries()){
   const section=el('section','segment');section.append(el('h3','',type==='ics'?`Eintrag ${i+1}`:`Kontakt ${i+1}`));
   for(const [name,value] of item){if(!labels[name])continue;const row=el('div','key-value');row.append(el('b','',labels[name]),el('span','',value));section.append(row);}doc.append(section);
  }
  resetSurface();ui.renderSurface.append(doc);
 }
}
function renderRtf(src){
 // Best-effort RTF text extractor, not a layout engine.
 let text=src.replace(/\\'([\da-f]{2})/gi,(_,code)=>String.fromCharCode(parseInt(code,16)))
   .replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode((Number(n)+65536)%65536))
   .replace(/\\par\b/g,'\n').replace(/\\line\b/g,'\n').replace(/\\tab\b/g,'\t')
   .replace(/\{\\\*(?:[^{}]|\{[^{}]*\})*\}/g,'').replace(/\\[a-z]+-?\d* ?/gi,'').replace(/\\[^a-z]/gi,'').replace(/[{}]/g,'');
 resetSurface();ui.renderSurface.append(el('pre','doc-text',text.slice(0,2000000)));
}

async function setPage(n){if(!state.file||n<1||n>state.pageCount)return;state.page=n;if(state.type==='pdf')await renderPdfPage(state.generation);else if(state.type==='pptx')await showPptSlide(state.generation);else if(state.type==='cbz')await showComicPage(state.generation);else if(state.type==='epub')await showEpubChapter(state.generation);else if(state.type==='odp')await showOdpSlide(state.generation);else if(['xls','xlsx','ods'].includes(state.type)){state.sheetIndex=n-1;showSheet();}else if(state.type==='docx'){const page=ui.renderSurface.querySelectorAll('section.docx')[n-1];page?.scrollIntoView({block:'start',behavior:'smooth'});}updateControls();}
function enterFullscreen(){const app=ui.app;if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});}else if(app.requestFullscreen){app.requestFullscreen().catch(()=>{app.classList.toggle('pseudo-fullscreen');});}else app.classList.toggle('pseudo-fullscreen');}
ui.openBtn.addEventListener('click',()=>ui.fileInput.click());ui.dropZone.addEventListener('click',()=>ui.fileInput.click());ui.dropZone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ui.fileInput.click();}});ui.fileInput.addEventListener('change',e=>openFile(e.target.files?.[0]));ui.clearBtn.addEventListener('click',clearCurrent);
ui.prevBtn.addEventListener('click',()=>setPage(state.page-1));ui.nextBtn.addEventListener('click',()=>setPage(state.page+1));ui.zoomInBtn.addEventListener('click',()=>changeZoom(1.25));ui.zoomOutBtn.addEventListener('click',()=>changeZoom(.8));ui.fitBtn.addEventListener('click',()=>{state.zoom=1;state.fit=true;refreshZoom();});ui.fullscreenBtn.addEventListener('click',enterFullscreen);
// Trackpad zoom and two-finger mobile zoom, with document-centred PDF anchoring.
ui.viewerScroll.addEventListener('wheel',e=>{
 if(!e.ctrlKey||!state.file)return;
 e.preventDefault();changeZoom(e.deltaY<0?1.12:1/1.12);
},{passive:false});
let pinchStartDistance=0,pinchStartZoom=1;
const touchDistance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
ui.viewerScroll.addEventListener('touchstart',e=>{
 if(e.touches.length===2&&state.file){pinchStartDistance=touchDistance(e.touches[0],e.touches[1]);pinchStartZoom=state.zoom;}
},{passive:true});
ui.viewerScroll.addEventListener('touchend',e=>{
 if(pinchStartDistance&&e.touches.length<2){
  pinchStartDistance=0;
  if(Math.abs(state.zoom-pinchStartZoom)>.01)refreshZoom();
 }
},{passive:true});
ui.viewerScroll.addEventListener('touchmove',e=>{
 if(!state.file||!pinchStartDistance||e.touches.length!==2)return;
 e.preventDefault();
 const next=pinchStartZoom*touchDistance(e.touches[0],e.touches[1])/pinchStartDistance;
 state.zoom=Math.max(.4,Math.min(5,Math.round(next*100)/100));state.fit=false;
 ui.zoomLabel.textContent=Math.round(state.zoom*100)+'%';
},{passive:false});
// Mouse drag-to-pan for enlarged PDFs (touch uses native two-axis scrolling).
let panOrigin=null;
ui.viewerScroll.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='mouse'||e.button!==0||state.type!=='pdf'||state.zoom<=1)return;
 const view=ui.viewerScroll;
 if(view.scrollWidth<=view.clientWidth&&view.scrollHeight<=view.clientHeight)return;
 panOrigin={x:e.clientX,y:e.clientY,left:view.scrollLeft,top:view.scrollTop,id:e.pointerId};
 view.setPointerCapture?.(e.pointerId);view.classList.add('is-panning');
});
ui.viewerScroll.addEventListener('pointermove',e=>{
 if(!panOrigin||e.pointerId!==panOrigin.id)return;
 ui.viewerScroll.scrollLeft=panOrigin.left-(e.clientX-panOrigin.x);
 ui.viewerScroll.scrollTop=panOrigin.top-(e.clientY-panOrigin.y);
});
const finishPan=()=>{panOrigin=null;ui.viewerScroll.classList.remove('is-panning');};
ui.viewerScroll.addEventListener('pointerup',finishPan);
ui.viewerScroll.addEventListener('pointercancel',finishPan);
document.addEventListener('fullscreenchange',()=>{ui.fullscreenBtn.title=document.fullscreenElement?'Vollbild verlassen':'Vollbild';if(state.type==='pdf')setTimeout(()=>renderPdfPage(state.generation),130);});
document.addEventListener('keydown',e=>{if(/input|textarea/i.test(e.target?.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();ui.fileInput.click();return;}if(e.key==='Escape'&&ui.app.classList.contains('pseudo-fullscreen')){ui.app.classList.remove('pseudo-fullscreen');return;}if(!state.file)return;if(e.key==='ArrowLeft'||e.key==='PageUp'){if(state.pageCount>1){e.preventDefault();setPage(state.page-1);}}else if(e.key==='ArrowRight'||e.key==='PageDown'){if(state.pageCount>1){e.preventDefault();setPage(state.page+1);}}else if((e.ctrlKey||e.metaKey)&&(e.key==='+'||e.key==='=')){e.preventDefault();changeZoom(1.25);}else if((e.ctrlKey||e.metaKey)&&e.key==='-'){e.preventDefault();changeZoom(.8);}});
let dragDepth=0;document.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();dragDepth++;ui.dropZone.classList.add('drag-over');});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',e=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)ui.dropZone.classList.remove('drag-over');});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;ui.dropZone.classList.remove('drag-over');if(e.dataTransfer?.files?.length)openFile(e.dataTransfer.files[0]);});
window.addEventListener('resize',()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(()=>{if(state.type==='pdf'&&state.pdf&&state.fit)renderPdfPage(state.generation,true);else if(state.type==='pptx'&&state.fit)showPptSlide(state.generation,true);else if(state.type==='odp'&&state.fit)showOdpSlide(state.generation,true);},160);});
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});reg.update().catch(()=>{});let hadController=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)ui.updateToast.hidden=false;hadController=true;});}catch(e){console.warn('Offline-Service-Worker nicht verfügbar:',e);}});}
ui.reloadBtn.addEventListener('click',()=>location.reload());
updateControls();
})();
