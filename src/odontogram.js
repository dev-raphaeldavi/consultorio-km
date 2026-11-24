import contours from './tooth-contours.json' with {type:'json'};
export const dentitions={
 permanent:{label:'Permanentes',upper:[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower:[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],width:965,height:450,centers:[44,99,153,208,263,318,372,427,526,581,636,691,745,800,854,909],upperFace:175,lowerFace:275,upperTop:51,upperBottom:148,lowerTop:303,lowerBottom:395},
 primary:{label:'Decíduos',upper:[55,54,53,52,51,61,62,63,64,65],lower:[85,84,83,82,81,71,72,73,74,75],width:973,height:470,centers:[222,277,332,387,441,539,595,649,704,759],upperFace:191,lowerFace:291,upperTop:68,upperBottom:164,lowerTop:319,lowerBottom:411}
};
export function referenceChart(mode){
 const d=dentitions[mode];
 const button=(t,face,x,y,w,h)=>'<button type="button" class="'+(face?'face-segment':'tooth-profile')+'" data-action="'+(face?'tooth-face':'tooth')+'" data-tooth="'+t+'"'+(face?' data-surface="'+face+'"':'')+' aria-pressed="false" aria-label="Dente '+t+(face?', face '+({V:'vestibular',P:'palatina',L:'lingual',M:'mesial',D:'distal',O:'oclusal',I:'incisal'}[face]):', inteiro')+'" title="Dente '+t+(face?' · '+face:'')+'" style="left:'+x/d.width*100+'%;top:'+y/d.height*100+'%;width:'+w/d.width*100+'%;height:'+h/d.height*100+'%">'+(face?'<svg class="face-dot" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><circle cx="'+w/2+'" cy="'+h/2+'" r="3.5"/></svg>':'<svg class="tooth-contour" viewBox="'+x+' '+y+' '+w+' '+h+'" aria-hidden="true"><path d="'+contours[t]+'"/></svg>')+'</button>';
 const row=(teeth,lower)=>teeth.map((t,i)=>{
  const x=d.centers[i],fy=lower?d.lowerFace:d.upperFace,q=Math.floor(t/10),mesialRight=[1,4,5,8].includes(q),inner=lower?'L':'P';
  return '<div class="tooth-unit" data-tooth="'+t+'">'+button(t,null,x-19,lower?d.lowerTop:d.upperTop,38,(lower?d.lowerBottom-d.lowerTop:d.upperBottom-d.upperTop))+
  button(t,lower?inner:'V',x-18,fy-19,36,12)+button(t,lower?'V':inner,x-18,fy+7,36,12)+
  button(t,mesialRight?'D':'M',x-19,fy-18,12,36)+button(t,mesialRight?'M':'D',x+7,fy-18,12,36)+button(t,t%10<=3?'I':'O',x-7,fy-7,14,14)+'</div>';
 }).join('');
 return '<div class="reference-scroll"><div class="reference-board" style="aspect-ratio:'+d.width+'/'+d.height+'" aria-label="Odontograma '+d.label+'"><img src="/assets/odontogram-'+mode+'.png" alt="" draggable="false">'+row(d.upper,false)+row(d.lower,true)+'</div></div>';
}

