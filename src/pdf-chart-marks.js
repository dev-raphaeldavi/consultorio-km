import {rgb} from 'pdf-lib';
import {facesOf} from './findings.js';
export function drawChartMarks(page,chart,entries,x,top,scale){
 const red=rgb(.85,.08,.12),seen=new Set();
 for(const e of entries){
  const tooth=Number(e.body.tooth),upper=chart.upper.includes(tooth),index=(upper?chart.upper:chart.lower).indexOf(tooth);
  if(index<0)continue;
  const cx=chart.centers[index],a=upper?chart.upperTop:chart.lowerTop,b=upper?chart.upperBottom:chart.lowerBottom,fy=upper?chart.upperFace:chart.lowerFace;
  if(!seen.has(tooth)){page.drawEllipse({x:x+cx*scale,y:top-(a+b)/2*scale,xScale:22*scale,yScale:((b-a)/2+4)*scale,borderColor:red,borderWidth:.9});seen.add(tooth);}
  for(const face of new Set(facesOf(e.body))){
   if(face==='all')continue;
   const inner=upper?'P':'L',right=[1,4,5,8].includes(Math.floor(tooth/10));let dx=0,dy=0;
   if(face==='V')dy=upper?-13:13;
   if(face===inner)dy=upper?13:-13;
   if(face==='M'||face==='D')dx=(face==='M')===right?13:-13;
   page.drawCircle({x:x+(cx+dx)*scale,y:top-(fy+dy)*scale,size:3.5*scale,color:red});
  }
 }
}
