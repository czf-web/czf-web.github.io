import {snapshot,update} from './db.js';
import {STORES,setConfig,stamp} from './model.js';
import {blobToURL,decodeImage} from './images.js';
import {graphErrors,assertGraph} from './integrity.js';
export function downloadFile(text,name,mime='application/json',bom=false){const url=URL.createObjectURL(new Blob([bom?'\ufeff':'',text],{type:mime+';charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export async function encodeBackup(s=undefined){s=s||await snapshot();assertGraph(s);return {app:'shijuan-papers',version:1,exportedAt:stamp(),data:{...s,images:await Promise.all(s.images.map(async image=>({...image,data:await blobToURL(image.data)})))}};}
export async function downloadBackup({mark=true,name='拾卷-完整备份'}={}){const backup=await encodeBackup();downloadFile(JSON.stringify(backup,null,2),`${name}-${new Date().toISOString().slice(0,10)}.json`);if(mark)await update(s=>setConfig(s,'lastBackupAt',stamp()));return backup;}
export async function decodeBackup(raw){if(raw?.app!=='shijuan-papers'||raw.version!==1||!raw.data)throw Error('不是拾卷第一轮的完整备份（版本 1）');const s={};for(const store of STORES){if(!Array.isArray(raw.data[store]))throw Error(`备份缺少 ${store}`);s[store]=structuredClone(raw.data[store]);}s.images=await Promise.all(s.images.map(decodeImage));for(const j of s.jobs)if(['running','pending'].includes(j.status)){j.status='error';j.message='上次识别中断，原图保留，可重试';j.updatedAt=stamp();}const errors=graphErrors(s);return {data:s,errors};}
const canonical=value=>{if(value instanceof Blob)return {blobType:value.type,blobSize:value.size};if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='updatedAt').sort().map(k=>[k,canonical(value[k])]));return value;};
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function mergePlan(local,incoming){
  const next=structuredClone(local),source=structuredClone(incoming),report={added:0,skipped:0,conflicts:[],references:[]},additions=[];
  const imageMap=new Map(),hashMap=new Map(next.images.map(i=>[i.hash,i.id])),blockedImages=new Set();
  for(const img of source.images){const byId=next.images.find(i=>i.id===img.id);if(byId&&byId.hash!==img.hash){blockedImages.add(img.id);report.conflicts.push({store:'images',id:img.id,message:`同 id 图片内容不同，保留本地：${img.name}`});continue;}const same=hashMap.get(img.hash);if(same&&same!==img.id){imageMap.set(img.id,same);report.skipped++;}else hashMap.set(img.hash,img.id);}
  for(const q of source.questions)q.imageIds=q.imageIds.map(id=>imageMap.get(id)||id);
  for(const j of source.jobs)j.imageId=imageMap.get(j.imageId)||j.imageId;
  const blockedQuestions=new Set(source.questions.filter(q=>q.imageIds.some(id=>blockedImages.has(id))).map(q=>q.id));
  for(const store of STORES)for(const entry of source[store]){
    if(store==='settings'&&next.settings.some(x=>x.key===entry.key&&x.id!==entry.id)){report.conflicts.push({store,id:entry.id,message:'同名设置来自不同数据库，保留本地设置'});continue;}
    if(store==='images'&&(imageMap.has(entry.id)||blockedImages.has(entry.id)))continue;
    if((store==='questions'&&blockedQuestions.has(entry.id))||(store==='jobs'&&blockedImages.has(entry.imageId))){report.references.push({store,id:entry.id,message:'导入依赖了冲突图片，保留本地并跳过该记录'});continue;}
    const current=next[store].find(r=>r.id===entry.id);if(current){if(equal(current,entry))report.skipped++;else report.conflicts.push({store,id:entry.id,message:'同 id 内容不同，保留本地'});}
    else{next[store].push(entry);additions.push({store,id:entry.id,paperId:entry.paperId||(store==='papers'?entry.id:null)});}
  }
  // Roll back additions belonging to inconsistent paper graphs, never keep dangling links.
  for(let round=0;round<STORES.length;round++){
    const issues=graphErrors(next);if(!issues.length)break;report.references.push(...issues);
    const paperIds=new Set(issues.map(x=>x.paperId).filter(Boolean));let removed=0;
    for(const added of [...additions])if(paperIds.has(added.paperId)||issues.some(x=>x.store===added.store&&x.id===added.id)){next[added.store]=next[added.store].filter(x=>x.id!==added.id);additions.splice(additions.indexOf(added),1);removed++;}
    if(!removed)throw Error('本地数据存在不一致，无法安全合并');
  }
  assertGraph(next);report.added=additions.length;return {data:next,report};
}
export async function prepareImport(raw){const decoded=await decodeBackup(raw);if(decoded.errors.length)return {incoming:decoded.data,invalid:decoded.errors,plan:null};const local=await snapshot();return {incoming:decoded.data,invalid:[],plan:mergePlan(local,decoded.data)};}
export async function applyImport(prepared,mode){if(prepared.invalid.length)throw Error('备份有悬空引用或无效字段，已阻止导入');return update(local=>{if(mode==='replace'){Object.assign(local,structuredClone(prepared.incoming));assertGraph(local);return {added:STORES.reduce((n,k)=>n+local[k].length,0),skipped:0,conflicts:[],references:[]};}if(mode!=='merge')throw Error('请选择导入模式');const plan=mergePlan(local,prepared.incoming);Object.assign(local,plan.data);return plan.report;});}
