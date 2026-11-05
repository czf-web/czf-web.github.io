// Strict parser: invalid tokens stay errors instead of silently shifting answers.
export function parseAnswers(input,{total,alphabet='ABCD',standard=false}={}){
  if(!Number.isInteger(total)||total<1||total>1000)return {ok:false,entries:[],errors:[{message:'总题数须为 1–1000 的整数',line:1,column:1,index:0}],count:0,mode:null,text:String(input)};
  const text=String(input).normalize('NFKC').toUpperCase().replace(/\r\n?/g,'\n');
  const errors=[],entries=new Map(),positions=new Map();let cursor=0,sequential=1,mode=null,count=0;
  function error(message,index=cursor){const prefix=text.slice(0,index);errors.push({message,line:prefix.split('\n').length,column:index-(prefix.lastIndexOf('\n')+1)+1,index});}
  function add(number,answer,uncertain,index){count++;if(entries.has(number))error(`题号 ${number} 重复或区间重叠`,index);else{entries.set(number,{number,answer:answer==='-'||answer==='*'?'':answer,uncertain});positions.set(number,index);}if(number<1||number>total)error(`题号 ${number} 超出 1–${total}`,index);if(answer==='-'||answer==='*'){if(standard)error(`标准答案第 ${number} 题不允许未作答`,index);}else if(!alphabet.includes(answer))error(`第 ${number} 题答案 ${answer} 超出选项范围 ${alphabet}`,index);if(standard&&uncertain)error(`标准答案第 ${number} 题不能含不确定标记`,index);}
  const separator=/[\s,，、;；/]/;
  while(cursor<text.length){
    if(separator.test(text[cursor])){cursor++;continue;}
    const start=cursor,rest=text.slice(cursor);
    const range=rest.match(/^(\d+)\s*[-~～—–]\s*(\d+)\s*[:.、]?\s*/);
    const numbered=!range&&rest.match(/^(\d+)\s*[.:、)）]\s*/);
    if(range){
      if(mode==='sequential')error('不能混合无题号答案与带题号答案',start);mode='numbered';
      const from=Number(range[1]),to=Number(range[2]);cursor+=range[0].length;const collected=[];
      if(from>to||to-from>10000){error(`无效题号区间 ${from}–${to}`,start);while(cursor<text.length&&text[cursor]!=='\n')cursor++;continue;}
      while(cursor<text.length){
        if(separator.test(text[cursor])){cursor++;continue;}
        if(/\d/.test(text[cursor]))break;
        if(/[A-Z*\-]/.test(text[cursor])){const at=cursor,answer=text[cursor++];let uncertain=false;if(text[cursor]==='?'){uncertain=true;cursor++;}collected.push({answer,uncertain,at});}
        else{error(`无法识别字符「${text[cursor]}」`,cursor);cursor++;}
      }
      if(collected.length!==to-from+1)error(`区间 ${from}–${to} 应有 ${to-from+1} 题，实际识别 ${collected.length} 题`,start);
      collected.forEach((x,i)=>add(from+i,x.answer,x.uncertain,x.at));
    }else if(numbered){
      if(mode==='sequential')error('不能混合无题号答案与带题号答案',start);mode='numbered';cursor+=numbered[0].length;
      if(!/[A-Z*\-]/.test(text[cursor]||'')){error(`题号 ${numbered[1]} 后缺少有效答案`,cursor);if(cursor<text.length)cursor++;continue;}
      const answer=text[cursor++];let uncertain=false;if(text[cursor]==='?'){uncertain=true;cursor++;}add(Number(numbered[1]),answer,uncertain,start);
    }else if(/[A-Z*\-]/.test(text[cursor])){
      if(mode==='numbered')error('带题号答案中出现了没有题号的答案',start);else mode='sequential';
      const answer=text[cursor++];let uncertain=false;if(text[cursor]==='?'){uncertain=true;cursor++;}add(sequential++,answer,uncertain,start);
    }else{error(`无法识别字符「${text[cursor]}」`,cursor);cursor++;}
  }
  const missing=Array.from({length:total},(_,i)=>i+1).filter(n=>!entries.has(n));
  if(count!==total)error(`应为 ${total} 题，实际识别 ${count} 题`,text.length);
  if(missing.length)error(`缺少题号：${compressNumbers(missing)}`,text.length);
  return {ok:errors.length===0,entries:[...entries.values()].sort((a,b)=>a.number-b.number),errors,count,mode:mode||'sequential',text};
}
export function compressNumbers(numbers){const sorted=[...new Set(numbers)].sort((a,b)=>a-b),parts=[];for(let i=0;i<sorted.length;i++){const start=sorted[i];while(i+1<sorted.length&&sorted[i+1]===sorted[i]+1)i++;parts.push(start===sorted[i]?String(start):`${start}–${sorted[i]}`);}return parts.join('、');}
export function gradeAnswers(key,answers){
  if(key.length!==answers.length)throw Error('标准答案与我的答案题数不一致');
  return key.map((k,i)=>{const mine=answers[i];if(!k.answer)throw Error('标准答案不允许缺答');return {...mine,result:!mine.answer?'blank':mine.answer!==k.answer?'wrong':mine.uncertain?'lucky':'correct'};});
}
export function serializeAnswers(entries,numberFor){return entries.map((x,i)=>`${numberFor?numberFor(x):x.number??i+1}.${x.answer||'-'}${x.uncertain?'?':''}`).join(' ');}
