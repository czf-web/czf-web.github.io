import {snapshot,update} from './db.js';
import {prepareImage,addImage} from './images.js';
import {uid,stamp,touch,splitOCR} from './model.js';
function timeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'超时，可重试或手动补录')),ms);})]).finally(()=>clearTimeout(timer));}
function refreshText(s,questionId){const q=s.questions.find(q=>q.id===questionId);if(!q)return;const p=s.papers.find(p=>p.id===q.paperId);const jobs=s.jobs.filter(j=>j.questionId===q.id&&j.status==='done').sort((a,b)=>a.order-b.order);const text=jobs.map(j=>j.text).join('\n\n');q.rawOCR=text;if(q.ocrAuto)Object.assign(q,splitOCR(text,p?.alphabet||Object.keys(q.options).join('')));Object.assign(q,touch(q));}
export class OCRQueue{
  constructor(onChange){this.onChange=onChange;this.worker=null;this.running=false;this.progress=new Map();}
  async restore(){await update(s=>{for(const job of s.jobs)if(['pending','running'].includes(job.status))Object.assign(job,touch(job,{status:'error',message:'上次识别中断，原图已保留，可重试'}));});}
  async add(files,paperId,attemptId,targets=[]){
    const prepared=await Promise.allSettled([...files].map(prepareImage)),errors=[],ids=[];
    await update(s=>{for(let index=0;index<prepared.length;index++){const r=prepared[index];if(r.status==='rejected'){errors.push(r.reason.message);continue;}const imageId=addImage(s,r.value),id=uid();s.jobs.push({id,paperId,attemptId:attemptId||null,questionId:targets[index]||null,imageId,order:Date.now()+index/1000,text:'',status:'unassigned',message:'等待确认分配',updatedAt:stamp()});ids.push(id);}});
    this.onChange({type:'added'});return {ids,errors};
  }
  async assign(assignments){
    if(this.running)throw Error('请等待当前识别队列完成后调整分配');
    await update(s=>{const touched=new Set();for(const {id,questionId} of assignments){const job=s.jobs.find(j=>j.id===id);if(!job)throw Error('截图草稿不存在');const q=s.questions.find(q=>q.id===questionId);if(questionId&&(!q||q.paperId!==job.paperId))throw Error('目标题号不属于这套题');if(job.questionId)touched.add(job.questionId);job.questionId=questionId||null;job.status=questionId?(job.status==='done'?'done':'pending'):'unassigned';job.message=questionId?'排队中':'暂不分配';Object.assign(job,touch(job));if(q){if(!q.imageIds.includes(job.imageId))q.imageIds.push(job.imageId);if(q.completion==='pending')q.completion='draft';touched.add(q.id);}}
      for(const qId of touched){const q=s.questions.find(q=>q.id===qId);if(!q)continue;const assigned=new Set(s.jobs.filter(j=>j.questionId===qId).map(j=>j.imageId));const jobImages=new Set(s.jobs.map(j=>j.imageId));q.imageIds=q.imageIds.filter(id=>!jobImages.has(id)||assigned.has(id));refreshText(s,qId);}
    });
    this.onChange({type:'assigned'});void this.run();
  }
  async getWorker(){if(this.worker)return this.worker;if(!globalThis.Tesseract)throw Error('OCR 程序缺失，请检查 vendor/tesseract/');const base=new URL('../vendor/tesseract/',import.meta.url);let rejectInit,ready=false;const failure=new Promise((_,reject)=>{rejectInit=reject;});
    const creation=Tesseract.createWorker(['chi_sim','eng'],1,{workerPath:new URL('worker.min.js',base).href,corePath:new URL('core/',base).href,langPath:new URL('lang',base).href,workerBlobURL:false,cacheMethod:'none',gzip:true,errorHandler:error=>{if(!ready)rejectInit(Error(String(error)));},logger:message=>{if(!this.activeId)return;const labels={'recognizing text':'识别文字','loading tesseract core':'加载本地引擎','loading language traineddata':'加载中英文语言包','initializing api':'初始化识别器','initializing tesseract':'启动引擎'};this.progress.set(this.activeId,{percent:Math.round((message.progress||0)*100),message:labels[message.status]||'准备识别'});this.onChange({type:'progress',id:this.activeId});}});
    let worker;try{worker=await timeout(Promise.race([creation,failure]),90000,'OCR 初始化');ready=true;await worker.setParameters({preserve_interword_spaces:'1'});}catch(error){creation.then(w=>w.terminate()).catch(()=>{});throw error;}this.worker=worker;return worker;
  }
  async run(){if(this.running)return;this.running=true;try{while(true){const s=await snapshot(),job=s.jobs.filter(j=>j.status==='pending'&&j.questionId).sort((a,b)=>a.order-b.order)[0];if(!job)break;this.activeId=job.id;await update(s=>{const j=s.jobs.find(j=>j.id===job.id);Object.assign(j,touch(j,{status:'running',message:'识别中'}));});this.onChange({type:'started',id:job.id});
      try{const worker=await this.getWorker(),image=s.images.find(i=>i.id===job.imageId),{data}=await timeout(worker.recognize(image.data),120000,'截图识别');await update(s=>{const current=s.jobs.find(j=>j.id===job.id);if(!current)return;Object.assign(current,touch(current,{status:'done',text:data.text,message:data.text.trim()?'识别完成，请校对':'未识别到文字，可直接保留原图'}));refreshText(s,current.questionId);});}
      catch(error){await update(s=>{const current=s.jobs.find(j=>j.id===job.id);if(current)Object.assign(current,touch(current,{status:'error',message:'识别失败：'+(error?.message||String(error))+'。原图已保留。'}));});if(this.worker)await this.worker.terminate().catch(()=>{});this.worker=null;}
      this.progress.delete(job.id);this.onChange({type:'finished',id:job.id});
    }}finally{this.running=false;this.activeId=null;this.onChange({type:'idle'});}}
  async retry(id){await update(s=>{const job=s.jobs.find(j=>j.id===id);if(job?.questionId)Object.assign(job,touch(job,{status:'pending',message:'等待重试'}));});void this.run();}
}
