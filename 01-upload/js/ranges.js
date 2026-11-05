import {compressNumbers} from './answers.js';
// Editable examples, not official question-count recommendations.
export function presetModuleSpecs(total){return total===120?[[10,'政治理论'],[10,'常识判断'],[25,'言语理解'],[15,'数量关系'],[35,'判断推理'],[25,'资料分析']]:total===130?[[10,'政治理论'],[10,'常识判断'],[40,'言语理解'],[10,'数量关系'],[35,'判断推理'],[25,'资料分析']]:[[total,'言语理解']];}
export function validateRanges(total,moduleRanges,typeRanges=[],types=[]){
  const errors=[];if(!Number.isInteger(total)||total<1||total>1000)return {ok:false,errors:['总题数须为 1–1000 的整数']};
  const owners=Array.from({length:total+1},()=>[]);
  moduleRanges.forEach((r,i)=>{if(!r.moduleId)errors.push(`第 ${i+1} 段未选择模块`);if(!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start>r.end){errors.push(`第 ${i+1} 个模块区间无效`);return;}if(r.start<1||r.end>total)errors.push(`模块区间 ${r.start}–${r.end} 越界（1–${total}）`);if(r.points!==null&&(!Number.isFinite(r.points)||r.points<0))errors.push(`区间 ${r.start}–${r.end} 分值须为非负数`);for(let n=Math.max(1,r.start);n<=Math.min(total,r.end);n++)owners[n].push(r.moduleId);});
  const missing=[],overlap=[];for(let n=1;n<=total;n++){if(!owners[n].length)missing.push(n);if(owners[n].length>1)overlap.push(n);}
  if(missing.length)errors.push(`模块缺失题号：${compressNumbers(missing)}`);if(overlap.length)errors.push(`模块重叠题号：${compressNumbers(overlap)}`);
  const typed=new Map();typeRanges.forEach((r,i)=>{const t=types.find(t=>t.id===r.typeId);if(!t)errors.push(`第 ${i+1} 个题型不存在`);if(!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start>r.end){errors.push(`第 ${i+1} 个题型区间无效`);return;}if(r.start<1||r.end>total)errors.push(`题型区间 ${r.start}–${r.end} 超出 1–${total}`);const invalid=[],duplicates=[];for(let n=Math.max(1,r.start);n<=Math.min(total,r.end);n++){if(owners[n]?.length!==1||owners[n][0]!==t?.moduleId)invalid.push(n);if(typed.has(n))duplicates.push(n);typed.set(n,r.typeId);}if(invalid.length)errors.push(`题型区间超出所属模块：${compressNumbers(invalid)}`);if(duplicates.length)errors.push(`题型重叠题号：${compressNumbers(duplicates)}`);});
  return {ok:errors.length===0,errors};
}
export function moduleAt(paper,number){return paper.moduleRanges.find(r=>number>=r.start&&number<=r.end)?.moduleId||null;}
export function typeAt(paper,number){return paper.typeRanges.find(r=>number>=r.start&&number<=r.end)?.typeId||null;}
export function typeCoverage(paper,moduleId){const numbers=paper.moduleRanges.filter(r=>r.moduleId===moduleId).flatMap(r=>Array.from({length:r.end-r.start+1},(_,i)=>r.start+i));return numbers.length>0&&numbers.every(n=>paper.typeRanges.some(r=>n>=r.start&&n<=r.end));}
