// Only used for OCR cleanup. Edit patterns/thresholds here; no answer or language changes.
export const OCR_CONFIG = {
  lowConfidence: 65,
  autoGarbageConfidence: 45,
  autoGarbageHanRatio: 0.2,
  headerContextLines: 8,
  headerContextMaxLength: 32,
  layoutRules: [
    {id:'chapter',label:'章节标题',pattern:'^第[一二三四五六七八九十百零〇0-9Xx]*[部半][分份].{0,28}$',header:true},
    {id:'timing',label:'题量与参考时间',pattern:'^[（(]?共[0-9一二三四五六七八九十百]+题[,，、]?参考时间[:：]?.{0,24}[）)]?$',header:true},
    {id:'question-kind',label:'题目类别标签',pattern:'^[【\\[（(]?(单项选择题|多项选择题|单选题|多选题)[】\\]）)]?[:：]?$'},
    {id:'page',label:'页码',pattern:'^[-—–]?(第?[0-9]+页([/／共][0-9]+页?)?|[0-9]+[/／][0-9]+)[-—–]?$'},
    {id:'page-footer',label:'底部页码',pattern:'^[-—–]?[0-9]{1,4}[-—–]?$',footerOnly:true}
  ]
};
