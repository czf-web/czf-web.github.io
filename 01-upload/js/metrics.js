import {risk} from './model.js';
import {typeCoverage} from './ranges.js';
export const pct=x=>`${(x*100).toFixed(1)}%`;
export function summarize(rows){const count=rows.length,correct=rows.filter(x=>x.result==='correct').length,lucky=rows.filter(x=>x.result==='lucky').length,blank=rows.filter(x=>x.result==='blank').length,wrong=rows.filter(x=>x.result==='wrong').length;return {count,correct,lucky,blank,wrong,right:correct+lucky,incorrect:wrong+blank,pending:wrong+blank+lucky,accuracy:count?(correct+lucky)/count:0,stableAccuracy:count?correct/count:0,uncertain:rows.filter(x=>x.uncertain).length};}
export function attemptMetrics(paper,attempt,questions){
  const rows=attempt.status==='graded'?attempt.answers:[];const modules=[...new Set(paper.moduleRanges.map(r=>r.moduleId))].map(moduleId=>({moduleId,...summarize(rows.filter(a=>questions.find(q=>q.id===a.questionId)?.moduleId===moduleId)),minutes:attempt.moduleMinutes.find(x=>x.moduleId===moduleId)?.minutes??null,typeComplete:typeCoverage(paper,moduleId)}));
  const types=[];for(const m of modules){const groups=[...new Set(questions.filter(q=>q.moduleId===m.moduleId).map(q=>q.typeId).filter(Boolean))];for(const typeId of groups){const selected=rows.filter(a=>questions.find(q=>q.id===a.questionId)?.typeId===typeId);types.push({moduleId:m.moduleId,typeId,mode:m.typeComplete?'accuracy':'distribution',...summarize(m.typeComplete?selected:selected.filter(x=>risk(x.result)))});}}
  const reasons=[...new Set(rows.map(x=>x.reason).filter(Boolean))].map(reason=>({reason,count:rows.filter(x=>x.reason===reason).length}));
  const valued=paper.moduleRanges.filter(r=>r.points!==null);let score=null,valuedCount=0;
  if(valued.length){score=0;for(const q of questions){const range=valued.find(r=>q.number>=r.start&&q.number<=r.end);if(range){valuedCount++;const row=rows.find(a=>a.questionId===q.id);if(row&&['correct','lucky'].includes(row.result))score+=range.points;}}}
  if(score!==null)score=Math.round((score+Number.EPSILON)*100)/100;
  return {...summarize(rows),modules,types,reasons,score,valuedCount,totalMinutes:attempt.totalMinutes,filledModules:attempt.moduleMinutes.length,allModules:modules.length,moduleMinutesSum:Number(attempt.moduleMinutes.reduce((n,m)=>n+m.minutes,0).toFixed(2))};
}
