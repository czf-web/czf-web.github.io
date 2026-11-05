export const STORES=['papers','attempts','questions','images','tags','modules','types','settings','jobs'];
export const REASONS=['不会做','知识点没掌握','粗心','时间不够','蒙对','理解偏差'];
export const RESULT_LABELS={correct:'对',wrong:'错',blank:'未作答',lucky:'蒙对'};
export const COMPLETIONS={pending:'待补录',draft:'补录中',complete:'已补录'};
export const REVIEWS={unreviewed:'未复习',reviewed:'已复习',mastered:'已掌握'};
export const KINDS=['真题','模考','自编','零散练习'];
export const MODULE_ORDER=['政治理论','常识判断','言语理解','数量关系','判断推理','资料分析'];
const POLITICS_MODULE_ID='b6e42100-9759-4c46-8be1-000000000006';
const POLITICS_TYPE_ID='b6e42200-9759-4c46-8be1-000000000018';
export function orderedModules(modules){const rank=name=>{const index=MODULE_ORDER.indexOf(name);return index<0?MODULE_ORDER.length:index;};return [...modules].sort((a,b)=>rank(a.name)-rank(b.name));}
export const stamp=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();
export const isUUID=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const touch=(obj,patch={})=>({...obj,...patch,updatedAt:stamp()});
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&localDate(new Date(s+'T12:00:00'))===s;
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const letters=alphabet=>[...alphabet];
export const risk=result=>['wrong','blank','lucky'].includes(result);
export const emptyState=()=>Object.fromEntries(STORES.map(n=>[n,[]]));
export const named=(s,store,id)=>s[store].find(x=>x.id===id)?.name||'未分类';
export const config=(s,key,fallback)=>s.settings.find(x=>x.key===key)?.value??fallback;
export function setConfig(s,key,value){const old=s.settings.find(x=>x.key===key);if(old)Object.assign(old,touch(old,{value}));else s.settings.push({id:uid(),key,value,updatedAt:stamp()});}
export function initialCatalog(){
  const state=emptyState();
  let moduleIndex=0,typeIndex=0;
  for(const [name,types] of [['言语理解',['逻辑填空','片段阅读','语句排序']],['数量关系',['数学运算','数字推理']],['判断推理',['图形推理','定义判断','类比推理','逻辑判断']],['资料分析',['资料分析','增长率','比重','平均数']],['常识判断',['政治理论','法律常识','科技常识','人文历史']]]){
    const module={id:`b6e42100-9759-4c46-8be1-${String(++moduleIndex).padStart(12,'0')}`,name,active:true,updatedAt:stamp()};state.modules.push(module);
    state.types.push(...types.map(name=>({id:`b6e42200-9759-4c46-8be1-${String(++typeIndex).padStart(12,'0')}`,moduleId:module.id,name,active:true,updatedAt:stamp()})));
  }
  state.settings.push({id:'b6e42300-9759-4c46-8be1-000000000001',key:'alphabet',value:'ABCD',updatedAt:stamp()});
  // Keep the original five module/type UUIDs; the independent module uses new IDs.
  state.types.find(t=>t.name==='政治理论').active=false;
  upgradeCatalog(state);return state;
}
// Upgrade old browsers/backups once, without reclassifying questions or changing ranges.
export function upgradeCatalog(state){
  if(config(state,'catalogVersion',0)>=2)return false;
  let politics=state.modules.find(m=>m.name==='政治理论');
  if(!politics){politics={id:state.modules.some(m=>m.id===POLITICS_MODULE_ID)?uid():POLITICS_MODULE_ID,name:'政治理论',active:true,updatedAt:stamp()};state.modules.push(politics);}
  if(!state.types.some(t=>t.moduleId===politics.id)){state.types.push({id:state.types.some(t=>t.id===POLITICS_TYPE_ID)?uid():POLITICS_TYPE_ID,moduleId:politics.id,name:'政治理论',active:true,updatedAt:stamp()});}
  const markerId='b6e42300-9759-4c46-8be1-000000000002';
  const marker=state.settings.find(x=>x.key==='catalogVersion');
  if(marker)Object.assign(marker,touch(marker,{value:2}));
  else state.settings.push({id:state.settings.some(x=>x.id===markerId)?uid():markerId,key:'catalogVersion',value:2,updatedAt:stamp()});
  state.modules=orderedModules(state.modules);return true;
}
export function splitTags(text){return [...new Set(String(text).split(/[,，、;；\n]+/).map(t=>t.trim()).filter(Boolean))];}
export {splitOCR} from './ocr-text.js';
export function questionsFor(s,paperId){return s.questions.filter(q=>q.paperId===paperId&&!q.removed).sort((a,b)=>a.number-b.number);}
export function attemptsFor(s,paperId){return s.attempts.filter(a=>a.paperId===paperId).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));}
export function sourceOf(s,q){const p=s.papers.find(p=>p.id===q.paperId);return {name:p?.name||q.source.paperName,date:q.source.date,number:q.number,module:named(s,'modules',q.moduleId),deleted:!p,removed:q.removed};}
export function poolInfo(s,q){
  const events=s.attempts.filter(a=>a.status==='graded').flatMap(a=>a.answers.filter(x=>x.questionId===q.id&&risk(x.result)).map(x=>({...x,attemptId:a.id,date:a.date,updatedAt:a.updatedAt})));
  events.push(...(q.detachedResults||[]).filter(x=>risk(x.result)));
  events.sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
  return {inPool:!!(events.length||q.manualPool||q.keepPool),events,latest:events[0],errorCount:events.filter(x=>x.result!=='lucky').length,riskCount:events.length};
}
export function poolQuestions(s,filter={}){
  return s.questions.filter(q=>poolInfo(s,q).inPool).filter(q=>{
    const info=poolInfo(s,q);const source=sourceOf(s,q);
    return (!filter.hideMastered||q.review!=='mastered')&&(!filter.moduleId||q.moduleId===filter.moduleId)&&(!filter.typeId||q.typeId===filter.typeId)&&(!filter.paperId||(q.paperId||q.source.paperId)===filter.paperId)&&(!filter.completion||q.completion===filter.completion)&&(!filter.review||q.review===filter.review)&&(!filter.reason||info.events.some(x=>x.reason===filter.reason))&&(!filter.tagId||q.tagIds.includes(filter.tagId))&&(!filter.search||[q.stem,q.notes,q.number,source.name,...q.tagIds.map(id=>named(s,'tags',id))].join(' ').toLowerCase().includes(filter.search.toLowerCase()));
  }).sort((a,b)=>(b.source.date||'').localeCompare(a.source.date||'')||a.source.paperName.localeCompare(b.source.paperName)||a.number-b.number);
}
