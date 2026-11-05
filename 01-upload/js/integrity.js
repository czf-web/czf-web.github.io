import {STORES,isUUID,validDate,KINDS,REASONS,RESULT_LABELS,COMPLETIONS,REVIEWS} from './model.js';
import {validateRanges,moduleAt} from './ranges.js';
// Return every structural/reference issue so imports can show an actionable report.
export function graphErrors(s){
  const errors=[];const issue=(store,record,message)=>errors.push({store,id:record?.id,paperId:record?.paperId||((store==='papers')?record?.id:null),message});
  for(const store of STORES){if(!Array.isArray(s[store])){issue(store,null,`${store} 不是数组`);continue;}const ids=new Set();for(const r of s[store]){if(!r||!isUUID(r.id)||typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))issue(store,r,`${store} 的 id 或 updatedAt 无效`);if(ids.has(r?.id))issue(store,r,`${store} 存在重复 id`);ids.add(r?.id);}}
  if(errors.length)return errors;
  const exists=(store,id)=>s[store].some(r=>r.id===id);
  for(const m of s.modules)if(typeof m.name!=='string'||!m.name.trim())issue('modules',m,'模块名称无效');
  for(const t of s.types)if(!exists('modules',t.moduleId)||typeof t.name!=='string'||!t.name.trim())issue('types',t,'题型模块引用或名称无效');
  for(const t of s.tags)if(typeof t.name!=='string'||!t.name.trim())issue('tags',t,'标签名称无效');
  const hashes=new Set();for(const i of s.images){if(!/^[0-9a-f]{64}$/.test(i.hash)||!(i.data instanceof Blob)||!/^image\/(png|jpeg|webp|gif|bmp)$/.test(i.data.type)||typeof i.name!=='string')issue('images',i,'图片内容、格式或哈希无效');if(hashes.has(i.hash))issue('images',i,'图片内容哈希重复');hashes.add(i.hash);}
  for(const p of s.papers){
    if(typeof p.name!=='string'||!p.name.trim()||!KINDS.includes(p.kind)||!validDate(p.date)||!['ABCD','ABCDE'].includes(p.alphabet)||!Array.isArray(p.moduleRanges)||!Array.isArray(p.typeRanges)||!Array.isArray(p.key)){issue('papers',p,'套题字段无效');continue;}
    const rangeCheck=validateRanges(p.total,p.moduleRanges,p.typeRanges,s.types);for(const message of rangeCheck.errors)issue('papers',p,message);
    if(p.moduleRanges.some(r=>!exists('modules',r.moduleId)))issue('papers',p,'套题模块不存在');
    if(p.limit!==null&&(!Number.isFinite(p.limit)||p.limit<0))issue('papers',p,'套题限时无效');
    const qs=s.questions.filter(q=>q.paperId===p.id&&!q.removed);const ns=qs.map(q=>q.number);if(qs.length!==p.total||new Set(ns).size!==ns.length||ns.some(n=>!Number.isInteger(n)||n<1||n>p.total))issue('papers',p,'套题题号不完整或重复');
    const keyIds=new Set();for(const k of p.key){const q=qs.find(q=>q.id===k.questionId);if(!q||typeof k.answer!=='string'||k.answer.length!==1||!p.alphabet.includes(k.answer)||keyIds.has(k.questionId))issue('papers',p,'标准答案引用、字符或重复项无效');keyIds.add(k.questionId);}
    if(p.key.length&&p.key.length!==p.total&&!p.needsRegrade)issue('papers',p,'标准答案数量与套题不符');
  }
  for(const q of s.questions){
    if((q.paperId&&!exists('papers',q.paperId))||!exists('modules',q.moduleId)||(q.typeId&&!s.types.some(t=>t.id===q.typeId&&t.moduleId===q.moduleId)))issue('questions',q,'题目套题、模块或题型引用无效');
    if(!Number.isInteger(q.number)||q.number<1||!q.source||typeof q.source.paperName!=='string'||!validDate(q.source.date))issue('questions',q,'题号或来源快照无效');
    const parent=s.papers.find(p=>p.id===q.paperId);if(parent&&moduleAt(parent,q.number)!==q.moduleId)issue('questions',q,'题目模块与区间不一致');
    if(!Array.isArray(q.imageIds)||q.imageIds.some(id=>!exists('images',id))||!Array.isArray(q.tagIds)||q.tagIds.some(id=>!exists('tags',id)))issue('questions',q,'题目图片或标签引用不存在');
    if(typeof q.stem!=='string'||typeof q.notes!=='string'||typeof q.rawOCR!=='string'||!q.options||Object.entries(q.options).some(([key,value])=>!['A','B','C','D','E'].includes(key)||typeof value!=='string')||!Object.hasOwn(COMPLETIONS,q.completion)||!Object.hasOwn(REVIEWS,q.review)||!Array.isArray(q.redo))issue('questions',q,'题目内容或状态无效');
    if(q.durationSeconds!==null&&(!Number.isFinite(q.durationSeconds)||q.durationSeconds<0))issue('questions',q,'题目用时无效');
  }
  for(const a of s.attempts){const p=s.papers.find(p=>p.id===a.paperId);if(!p||!validDate(a.date)||!['ungraded','graded'].includes(a.status)||!Array.isArray(a.answers)||!Array.isArray(a.moduleMinutes)||typeof a.summary!=='string'){issue('attempts',a,'作答字段或套题引用无效');continue;}
    const ids=new Set();for(const row of a.answers){const q=s.questions.find(q=>q.id===row.questionId);if(!q||q.paperId!==a.paperId||ids.has(row.questionId)||typeof row.answer!=='string'||row.answer.length>1||(row.answer&&!p.alphabet.includes(row.answer))||typeof row.uncertain!=='boolean'||!Object.hasOwn(RESULT_LABELS,row.result)||(row.reason&&!REASONS.includes(row.reason)))issue('attempts',a,'作答答案、结果或题目引用无效');ids.add(row.questionId);const key=p.key.find(k=>k.questionId===row.questionId)?.answer;if(a.status==='graded'&&!a.needsRegrade&&key){const expected=!row.answer?'blank':row.answer!==key?'wrong':row.uncertain?'lucky':'correct';if(row.result!==expected)issue('attempts',a,'作答结果与标准答案不一致');}}
    if(a.status==='graded'&&!a.needsRegrade&&a.answers.length!==p.total)issue('attempts',a,'已批改作答题数不完整');
    if(a.totalMinutes!==null&&(!Number.isFinite(a.totalMinutes)||a.totalMinutes<0))issue('attempts',a,'总实际用时无效');
    if(a.moduleMinutes.some(m=>!p.moduleRanges.some(r=>r.moduleId===m.moduleId)||!Number.isFinite(m.minutes)||m.minutes<0))issue('attempts',a,'模块用时无效');
    if(new Set(a.moduleMinutes.map(m=>m.moduleId)).size!==a.moduleMinutes.length)issue('attempts',a,'模块用时重复');
  }
  for(const j of s.jobs)if(!exists('images',j.imageId)||(j.paperId&&!exists('papers',j.paperId))||(j.questionId&&!exists('questions',j.questionId))||(j.attemptId&&!exists('attempts',j.attemptId))||typeof j.text!=='string'||!['unassigned','pending','running','done','error'].includes(j.status))issue('jobs',j,'OCR 草稿有悬空引用或无效状态');
  const settingKeys=new Set();for(const setting of s.settings){if(typeof setting.key!=='string'||(setting.key==='alphabet'&&!['ABCD','ABCDE'].includes(setting.value))||settingKeys.has(setting.key))issue('settings',setting,'设置字段无效或重复');settingKeys.add(setting.key);}
  return errors;
}
export function assertGraph(s){const errors=graphErrors(s);if(errors.length)throw Error(errors.map(x=>x.message).join('\n'));return s;}
