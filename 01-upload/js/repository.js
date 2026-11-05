import {update} from './db.js';
import {uid,stamp,touch,questionsFor,attemptsFor,poolInfo,risk,splitTags,named} from './model.js';
import {moduleAt,typeAt,validateRanges,typeCoverage} from './ranges.js';
import {gradeAnswers} from './answers.js';
function assertRanges(s,p){const check=validateRanges(p.total,p.moduleRanges,p.typeRanges,s.types);if(!check.ok)throw Error(check.errors.join('\n'));if(p.moduleRanges.some(r=>!s.modules.some(m=>m.id===r.moduleId)))throw Error('模块不存在');}
function source(p,q,s){return {paperId:p.id,paperName:p.name,date:p.date,number:q.number,moduleName:named(s,'modules',q.moduleId)};}
export function questionTemplate(paper,number,s){const q={id:uid(),paperId:paper.id,number,moduleId:moduleAt(paper,number),typeId:typeAt(paper,number),stem:'',options:Object.fromEntries([...paper.alphabet].map(l=>[l,''])),imageIds:[],tagIds:[],notes:'',durationSeconds:null,completion:'pending',review:'unreviewed',redo:[],manualPool:false,keepPool:false,removed:false,rawOCR:'',ocrAuto:true,detachedResults:[],updatedAt:stamp()};q.source=source(paper,q,s);return q;}
export function attemptTemplate(paper,date=paper.date){return {id:uid(),paperId:paper.id,date,answers:[],status:'ungraded',totalMinutes:null,moduleMinutes:[],summary:'',needsRegrade:false,updatedAt:stamp()};}
export const createPaper=draft=>update(s=>{
  const paper={...draft,id:uid(),key:[],archived:false,needsRegrade:false,createdAt:stamp(),updatedAt:stamp()};assertRanges(s,paper);s.papers.push(paper);for(let n=1;n<=paper.total;n++)s.questions.push(questionTemplate(paper,n,s));const attempt=attemptTemplate(paper);s.attempts.push(attempt);return {paperId:paper.id,attemptId:attempt.id};
});
// Phase 1 data API; the “再做一次” creation UI is intentionally phase 2.
export const createAttempt=(paperId,date)=>update(s=>{const p=s.papers.find(p=>p.id===paperId);if(!p)throw Error('套题不存在');const a=attemptTemplate(p,date);s.attempts.push(a);return a.id;});
function applyGrade(s,paper,attempt,key,mine){const qs=questionsFor(s,paper.id);const results=gradeAnswers(key,mine);const old=new Map(attempt.answers.map(x=>[x.questionId,x]));attempt.answers=results.map((row,i)=>({questionId:qs[i].id,answer:row.answer,uncertain:row.uncertain,result:row.result,reason:old.get(qs[i].id)?.reason||''}));Object.assign(attempt,touch(attempt,{status:'graded',needsRegrade:false}));}
export function gradingPlan(s,paperId,attemptId,key,mine){
  const p=s.papers.find(p=>p.id===paperId),a=s.attempts.find(a=>a.id===attemptId),copy=structuredClone(s),cp=copy.papers.find(p=>p.id===paperId),ca=copy.attempts.find(a=>a.id===attemptId),qs=questionsFor(copy,paperId);
  const changed=qs.filter((q,i)=>p.key.find(k=>k.questionId===q.id)?.answer!==key[i]?.answer).map(q=>q.number);
  cp.key=qs.map((q,i)=>({questionId:q.id,answer:key[i].answer}));
  if(changed.length&&p.key.length)for(const other of copy.attempts.filter(x=>x.paperId===paperId&&x.id!==attemptId&&x.status==='graded'))for(const answer of other.answers){const standard=cp.key.find(x=>x.questionId===answer.questionId)?.answer;if(standard)answer.result=!answer.answer?'blank':answer.answer!==standard?'wrong':answer.uncertain?'lucky':'correct';}
  applyGrade(copy,cp,ca,key,mine);
  const exits=qs.filter(q=>poolInfo(s,s.questions.find(old=>old.id===q.id)).inPool&&!poolInfo(copy,q).inPool).map(q=>({id:q.id,number:q.number}));
  return {regrade:a.status==='graded',changedKey:p.key.length>0&&changed.length>0,changedNumbers:changed,affectedAttempts:attemptsFor(s,paperId).filter(x=>x.status==='graded').length,exits};
}
export const saveGrade=({paperId,attemptId,key,mine,keepIds=[],timing})=>update(s=>{
  const p=s.papers.find(p=>p.id===paperId),a=s.attempts.find(a=>a.id===attemptId),qs=questionsFor(s,paperId);if(!p||!a||qs.length!==key.length||mine.length!==key.length)throw Error('套题或答案数量已变化，请重新预览');
  if(key.some(k=>typeof k.answer!=='string'||k.answer.length!==1||!p.alphabet.includes(k.answer))||mine.some(k=>typeof k.answer!=='string'||k.answer.length>1||(k.answer&&!p.alphabet.includes(k.answer))))throw Error('答案超出当前套题选项范围');
  const changed=p.key.length&&qs.some((q,i)=>p.key.find(k=>k.questionId===q.id)?.answer!==key[i].answer);
  p.key=qs.map((q,i)=>({questionId:q.id,answer:key[i].answer}));Object.assign(p,touch(p,{needsRegrade:false}));
  if(changed)for(const other of s.attempts.filter(x=>x.paperId===paperId&&x.status==='graded'&&x.id!==a.id)){for(const row of other.answers){const correct=p.key.find(k=>k.questionId===row.questionId)?.answer;if(correct)row.result=!row.answer?'blank':row.answer!==correct?'wrong':row.uncertain?'lucky':'correct';}Object.assign(other,touch(other));}
  applyGrade(s,p,a,key,mine);if(timing)Object.assign(a,touch(a,timing));for(const id of keepIds){const q=s.questions.find(q=>q.id===id);if(q)Object.assign(q,touch(q,{keepPool:true}));}
});
export const saveAttemptSummary=(attemptId,summary)=>update(s=>{const a=s.attempts.find(a=>a.id===attemptId);if(!a)throw Error('作答不存在');Object.assign(a,touch(a,{summary}));});
export const setPool=(questionId,manualPool=true)=>update(s=>{const q=s.questions.find(q=>q.id===questionId);Object.assign(q,touch(q,{manualPool}));});
export const setReview=(questionId,review)=>update(s=>{const q=s.questions.find(q=>q.id===questionId);Object.assign(q,touch(q,{review}));});
export const saveContent=(questionId,patch,tagNames,attemptId,reason)=>update(s=>{
  const q=s.questions.find(q=>q.id===questionId);if(!q)throw Error('题目已不存在');
  const paper=s.papers.find(p=>p.id===q.paperId);if(paper&&typeCoverage(paper,q.moduleId))patch.typeId=typeAt(paper,q.number);
  const tagIds=splitTags(tagNames).map(name=>{let tag=s.tags.find(t=>t.name===name);if(!tag){tag={id:uid(),name,updatedAt:stamp()};s.tags.push(tag);}return tag.id;});
  Object.assign(q,touch(q,{...patch,tagIds,ocrAuto:false}));
  const a=s.attempts.find(a=>a.id===attemptId),row=a?.answers.find(x=>x.questionId===q.id);
  if(row){row.reason=reason;Object.assign(a,touch(a));}else if(!q.paperId){const latest=q.detachedResults.at(-1);if(latest)latest.reason=reason;q.detachedReason=reason;}
});
function detachQuestion(s,q,paper,removed){
  q.detachedResults=s.attempts.filter(a=>a.paperId===paper.id).flatMap(a=>a.answers.filter(row=>row.questionId===q.id).map(row=>({...row,id:uid(),attemptId:null,date:a.date,updatedAt:stamp()})));
  q.detachedAnswer=paper.key.find(k=>k.questionId===q.id)?.answer||'';q.source=source(paper,q,s);Object.assign(q,touch(q,{paperId:null,removed,keepPool:true}));
  for(const j of s.jobs.filter(j=>j.questionId===q.id))Object.assign(j,touch(j,{paperId:null,attemptId:null}));
}
function garbageCollect(s){const used=new Set([...s.questions.flatMap(q=>q.imageIds),...s.jobs.map(j=>j.imageId)]);s.images=s.images.filter(i=>used.has(i.id));}
export const deletePaper=(paperId,mode)=>update(s=>{
  const p=s.papers.find(p=>p.id===paperId);if(!p)throw Error('套题不存在');if(mode==='archive'){Object.assign(p,touch(p,{archived:true}));return;}
  if(!['keep','all'].includes(mode))throw Error('无效删除模式');
  const retained=new Set();for(const q of questionsFor(s,paperId))if(mode==='keep'&&poolInfo(s,q).inPool){retained.add(q.id);detachQuestion(s,q,p,false);}
  s.questions=s.questions.filter(q=>q.paperId!==paperId);s.jobs=s.jobs.filter(j=>j.paperId!==paperId||retained.has(j.questionId));s.attempts=s.attempts.filter(a=>a.paperId!==paperId);s.papers=s.papers.filter(p=>p.id!==paperId);garbageCollect(s);
});
export const restorePaper=paperId=>update(s=>{const p=s.papers.find(p=>p.id===paperId);Object.assign(p,touch(p,{archived:false}));});
export function resizeImpact(s,paperId,total){return questionsFor(s,paperId).filter(q=>q.number>total).map(q=>({id:q.id,number:q.number,protected:poolInfo(s,q).inPool||!!(q.stem||q.notes||q.rawOCR||q.imageIds.length||q.tagIds.length||q.typeId||q.durationSeconds!==null)}));}
export const editPaper=(paperId,draft,removalChoices={})=>update(s=>{
  const p=s.papers.find(p=>p.id===paperId);assertRanges(s,draft);const oldTotal=p.total;
  const removed=questionsFor(s,paperId).filter(q=>q.number>draft.total);
  for(const q of removed){const protectedItem=resizeImpact(s,paperId,draft.total).find(x=>x.id===q.id)?.protected;if(protectedItem&&!['archive','delete'].includes(removalChoices[q.id]))throw Error(`请为第 ${q.number} 题选择归档或删除`);if(removalChoices[q.id]==='archive')detachQuestion(s,q,p,true);else{s.questions=s.questions.filter(x=>x.id!==q.id);s.jobs=s.jobs.filter(j=>j.questionId!==q.id);}}
  Object.assign(p,touch(p,draft));
  for(let n=oldTotal+1;n<=p.total;n++)s.questions.push(questionTemplate(p,n,s));
  const active=questionsFor(s,paperId);const activeIds=new Set(active.map(q=>q.id));p.key=p.key.filter(k=>activeIds.has(k.questionId));
  for(const q of active){q.moduleId=moduleAt(p,q.number);const configured=typeAt(p,q.number);if(configured)q.typeId=configured;else if(!s.types.some(t=>t.id===q.typeId&&t.moduleId===q.moduleId))q.typeId=null;q.source=source(p,q,s);Object.assign(q,touch(q));}
  for(const a of s.attempts.filter(a=>a.paperId===paperId)){a.answers=a.answers.filter(x=>activeIds.has(x.questionId));a.moduleMinutes=a.moduleMinutes.filter(m=>p.moduleRanges.some(r=>r.moduleId===m.moduleId));if(oldTotal!==p.total)Object.assign(a,touch(a,{needsRegrade:true}));}
  p.needsRegrade=oldTotal!==p.total;if(oldTotal===p.total)for(const a of s.attempts.filter(a=>a.paperId===paperId))Object.assign(a,touch(a));garbageCollect(s);
});
export const swapNumbers=(paperId,questionId,targetNumber)=>update(s=>{
  const p=s.papers.find(p=>p.id===paperId),q=s.questions.find(q=>q.id===questionId),other=questionsFor(s,paperId).find(q=>q.number===targetNumber);if(!q||!other||q.id===other.id)throw Error('请选择不同的有效题号');const old=q.number;q.number=other.number;other.number=old;for(const item of [q,other]){item.moduleId=moduleAt(p,item.number);const configured=typeAt(p,item.number);if(configured)item.typeId=configured;else if(!s.types.some(t=>t.id===item.typeId&&t.moduleId===item.moduleId))item.typeId=null;item.source=source(p,item,s);Object.assign(item,touch(item));}Object.assign(p,touch(p));
});
