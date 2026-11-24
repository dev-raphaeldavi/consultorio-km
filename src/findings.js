export const facesOf=body=>String(body.surface||'all').split(/[,\s]+/).filter(Boolean);
export const findingsOf=entries=>{
 const rows=entries.filter(e=>e.section==='odontogram');
 const superseded=new Set(rows.map(e=>e.body.supersedes).filter(Boolean));
 return rows.filter(e=>!superseded.has(e.id)&&!e.body.voided&&e.body.tooth&&e.body.findings);
};
export function markFindings(container,entries,selection={}){
 for(const b of container.querySelectorAll('button[data-tooth]')){
 const tooth=b.dataset.tooth,face=b.dataset.surface||'all';
 const toothEntries=entries.filter(e=>String(e.body.tooth)===tooth),selectedFaces=selection[tooth]||[];
 const saved=face==='all'?toothEntries.length>0:toothEntries.some(e=>facesOf(e.body).includes(face)||facesOf(e.body).includes('all'));
 const selected=face==='all'?selectedFaces.length>0:selectedFaces.includes(face)||selectedFaces.includes('all');
 b.classList.toggle('selected',selected||saved);b.setAttribute('aria-pressed',String(selected||saved));
 b.style.outline=selected?'2px solid #287c9a':'';
 }
}
