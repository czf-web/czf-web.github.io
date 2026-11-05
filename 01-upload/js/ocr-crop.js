import {normalizeCrop} from './ocr-text.js';
// Only rectangle metadata is returned. The original Blob is never altered.
export function chooseCrops({dialog,content,jobs,imageURL,lastCrop=null}){
  return new Promise(resolve=>{
    let index=0,finished=false,drag=null;
    const crops=Object.fromEntries(jobs.map(job=>[job.id,job.crop?{...job.crop}:null]));
    const end=result=>{if(finished)return;finished=true;dialog.removeEventListener('close',cancel);dialog.close();resolve(result);};
    const cancel=()=>end(null);dialog.addEventListener('close',cancel);
    function show(){
      const job=jobs[index];
      content.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">CROP BEFORE OCR</p><h2>只框题干与选项</h2></div><button type="button" class="icon-button" id="cancel-crop" aria-label="取消裁剪">×</button></div><p class="muted">第 ${index+1}/${jobs.length} 张。拖出选框；拖框内可移动，拖四角可缩放。原图完整保留。</p><div class="crop-stage"><img id="crop-image" src="${imageURL(job.imageId)}" alt="待识别完整原图" draggable="false"><svg id="crop-overlay" aria-label="拖框选择识别区域" role="img"><path id="crop-mask" fill="#14221f" fill-opacity="0.5" fill-rule="evenodd"></path><rect id="crop-selection" fill="transparent" stroke="#26866c" stroke-width="2" vector-effect="non-scaling-stroke" data-handle="move"></rect>${['nw','ne','sw','se'].map(handle=>`<circle data-handle="${handle}" fill="#fff" stroke="#26866c" stroke-width="2" vector-effect="non-scaling-stroke"></circle>`).join('')}</svg></div><p id="crop-error" class="muted" role="status"></p><div class="button-row"><button id="full-crop">完整图片</button><button id="reuse-crop" ${index===0&&!lastCrop?'disabled':''}>沿用上一张的裁剪框</button><button id="all-crops">本批沿用当前框</button></div><p id="crop-info" class="field-help"></p><div class="image-navigation"><button id="previous-crop" ${index===0?'disabled':''}>上一张</button><span>${index+1} / ${jobs.length}</span><button id="next-crop" ${index===jobs.length-1?'disabled':''}>下一张</button></div><div class="dialog-actions"><button id="skip-crop-ocr">跳过 OCR，仅保存图片</button><button class="primary" id="confirm-crops">确认裁剪并识别</button></div>`;
      const image=content.querySelector('#crop-image'),overlay=content.querySelector('#crop-overlay');
      function draw(){const width=image.naturalWidth||1,height=image.naturalHeight||1,r=crops[job.id]||{x:0,y:0,width:1,height:1};overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);const x=r.x*width,y=r.y*height,w=r.width*width,h=r.height*height;content.querySelector('#crop-mask').setAttribute('d',`M0 0H${width}V${height}H0Z M${x} ${y}h${w}v${h}h${-w}Z`);const selection=content.querySelector('#crop-selection');for(const [key,value] of Object.entries({x,y,width:w,height:h}))selection.setAttribute(key,value);const radius=12*width/Math.max(1,overlay.getBoundingClientRect().width);for(const circle of overlay.querySelectorAll('circle')){const mode=circle.dataset.handle;circle.setAttribute('cx',mode.endsWith('w')?x:x+w);circle.setAttribute('cy',mode.startsWith('n')?y:y+h);circle.setAttribute('r',radius);}content.querySelector('#crop-info').textContent=crops[job.id]?`识别范围：左 ${Math.round(r.x*100)}%，上 ${Math.round(r.y*100)}%，宽 ${Math.round(r.width*100)}%，高 ${Math.round(r.height*100)}%。沿用按相对比例，请核对。`:'当前识别完整图片。可以拖框避开章节标题、页码和装饰区。';}
      image.onload=draw;if(image.complete&&image.naturalWidth)draw();image.onerror=()=>{content.querySelector('#crop-error').textContent='图片无法预览，可保留原图或让 OCR 单张尝试。';};
      const point=event=>{const box=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};};
      overlay.addEventListener('pointerdown',event=>{if(!image.naturalWidth)return;event.preventDefault();overlay.setPointerCapture(event.pointerId);const p=point(event);drag={mode:crops[job.id]?(event.target.dataset.handle||'new'):'new',start:p,rect:{...(crops[job.id]||{x:0,y:0,width:1,height:1})}};});
      overlay.addEventListener('pointermove',event=>{if(!drag)return;const p=point(event),r=drag.rect;let next;
        if(drag.mode==='move')next={...r,x:Math.max(0,Math.min(1-r.width,r.x+p.x-drag.start.x)),y:Math.max(0,Math.min(1-r.height,r.y+p.y-drag.start.y))};
        else {const anchor=drag.mode==='new'?drag.start:{x:drag.mode.endsWith('w')?r.x+r.width:r.x,y:drag.mode.startsWith('n')?r.y+r.height:r.y};next={x:Math.min(anchor.x,p.x),y:Math.min(anchor.y,p.y),width:Math.max(.002,Math.abs(anchor.x-p.x)),height:Math.max(.002,Math.abs(anchor.y-p.y))};}
        if(next.x>=.998||next.y>=.998)return;crops[job.id]=normalizeCrop(next);draw();
      });
      const stop=()=>drag=null;overlay.addEventListener('pointerup',stop);overlay.addEventListener('pointercancel',stop);
      content.querySelector('#cancel-crop').onclick=cancel;
      content.querySelector('#full-crop').onclick=()=>{crops[job.id]=null;draw();};
      content.querySelector('#reuse-crop').onclick=()=>{crops[job.id]=structuredClone(index>0?crops[jobs[index-1].id]:lastCrop);draw();};
      content.querySelector('#all-crops').onclick=()=>{for(const item of jobs)crops[item.id]=structuredClone(crops[job.id]);draw();};
      content.querySelector('#previous-crop').onclick=()=>{index--;show();};content.querySelector('#next-crop').onclick=()=>{index++;show();};
      content.querySelector('#skip-crop-ocr').onclick=()=>end({crops,skipOCR:true});content.querySelector('#confirm-crops').onclick=()=>end({crops,skipOCR:false});
    }
    show();if(!dialog.open)dialog.showModal();
  });
}
