import {OCR_CONFIG} from './ocr-config.js';
export const SPLIT_WARNING='选项未能自动拆分，请对照原图手动填写';
// Normalize marker letters only. NFKC would incorrectly turn ① into 1.
function markerLetters(text){return String(text).replace(/[Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/\r\n?/g,'\n');}
const emptyOptions=alphabet=>Object.fromEntries([...alphabet].map(letter=>[letter,'']));
export function splitOCR(text,alphabet='ABCD'){
  const source=markerLetters(text),options=emptyOptions(alphabet);
  const re=new RegExp('(^|[\\n \\t])(['+alphabet+'])(?:[.．、:：)）][ \\t]*|[ \\t]+|(?=\\n|$))','g');
  const marks=[...source.matchAll(re)].map(m=>({letter:m[2],start:m.index+m[1].length,end:m.index+m[0].length}));
  for(const first of marks.filter(m=>m.letter===alphabet[0]).reverse()){
    const selected=[first];let next=marks.indexOf(first)+1;
    for(const letter of [...alphabet].slice(1)){const index=marks.findIndex((m,i)=>i>=next&&m.letter===letter);if(index<0)break;selected.push(marks[index]);next=index+1;}
    if(selected.length!==alphabet.length)continue;
    const values=selected.map((m,i)=>source.slice(m.end,selected[i+1]?.start??source.length).trim());
    const valid=values.every(value=>{
      if(!value||!/[\p{L}\p{N}]/u.test(value))return false;
      if(!/\p{Script=Han}/u.test(value)&&/[@®©]/.test(value)&&[...value].length<=32)return false;
      if(!/\p{N}/u.test(value)&&/^[ODQCo@®©\s.,，、;；:：()（）|/\\-]+$/.test(value))return false;
      return true;
    });
    if(!valid)continue;
    selected.forEach((mark,i)=>options[mark.letter]=values[i]);
    return {stem:source.slice(0,first.start).trim(),options,reliable:true,warning:''};
  }
  return {stem:source.trim(),options,reliable:false,warning:SPLIT_WARNING};
}
function flattenLines(blocks){const out=[];for(const block of blocks||[]){for(const paragraph of block.paragraphs||[])out.push(...(paragraph.lines||[]));if(!block.paragraphs&&block.lines)out.push(...block.lines);}return out;}
export function extractOCRLines(data){
  const detected=flattenLines(data.blocks);
  if(detected.length)return detected.map((line,index)=>({index,text:String(line.text||'').trim(),confidence:Number.isFinite(line.confidence)?line.confidence:null,bbox:line.bbox||null})).filter(line=>line.text);
  return String(data.text||'').split(/\r?\n/).map((text,index)=>({index,text:text.trim(),confidence:null,bbox:null})).filter(line=>line.text);
}
export function usableText(lines){return lines.filter(line=>!line.filtered).map(line=>line.text).join('\n');}
export function classifyOCRLines(input,{imageHeight=0,crop=null,config=OCR_CONFIG}={}){
  const lines=input.map(line=>({...line,filtered:false,filterReason:'',lowConfidence:line.confidence!==null&&line.confidence<config.lowConfidence}));
  let headerEnd=-1;
  lines.forEach((line,index)=>{
    const compact=markerLetters(line.text).replace(/\s+/g,'');
    for(const rule of config.layoutRules){
      if(rule.footerOnly){const pageHeight=crop?.height||imageHeight;const relativeTop=(line.bbox?.y0??-Infinity)-(crop?.top||0);if(!pageHeight||relativeTop/pageHeight<.86)continue;}
      if(new RegExp(rule.pattern,'u').test(compact)){line.filtered=true;line.filterReason=rule.label;if(rule.header&&index<14)headerEnd=Math.max(headerEnd,index);break;}
    }
    const content=[...line.text.replace(/\s/g,'')],han=(line.text.match(/\p{Script=Han}/gu)||[]).length;
    const hanRatio=content.length?han/content.length:0;
    const protectedToken=/^[A-E](?:[.．、:：)）]|\s|$)/.test(line.text)||/[①-⑳㉑-㊿]/.test(line.text)||/^[\d\s.,，%％+＋\-*/()（）]+$/.test(line.text);
    if(!line.filtered&&!protectedToken&&line.confidence!==null&&line.confidence<=config.autoGarbageConfidence&&hanRatio<config.autoGarbageHanRatio){line.filtered=true;line.filterReason='低置信度且汉字占比极低';}
  });
  // Decorative fragments above a detected chapter/time heading are layout, not stem.
  if(headerEnd>=0)for(let index=Math.max(0,headerEnd-config.headerContextLines);index<headerEnd;index++){
    const line=lines[index],length=[...line.text.replace(/\s/g,'')].length;
    if(!line.filtered&&length<=config.headerContextMaxLength&&!/^\s*\d+[.、．]/.test(line.text)){
      line.filtered=true;line.filterReason='章节标题区装饰文字';
    }
  }
  return lines;
}
export function normalizeCrop(rect){
  if(!rect)return null;
  if(!['x','y','width','height'].every(key=>Number.isFinite(rect[key])))throw Error('裁剪框坐标无效');
  const x=Math.max(0,Math.min(1,rect.x)),y=Math.max(0,Math.min(1,rect.y));
  const width=Math.min(1-x,Math.max(0,rect.width)),height=Math.min(1-y,Math.max(0,rect.height));
  if(width<.002||height<.002)throw Error('裁剪框太小，请重新拖选');
  return {x,y,width,height};
}
export function pixelRectangle(rect,width,height){if(!rect)return null;const r=normalizeCrop(rect),left=Math.floor(r.x*width),top=Math.floor(r.y*height);return {left,top,width:Math.max(1,Math.min(width-left,Math.round(r.width*width))),height:Math.max(1,Math.min(height-top,Math.round(r.height*height)))};}
