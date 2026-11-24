export const facesOf=body=>String(body.surface||'all').split(/[,\s]+/).filter(Boolean);
export const findingsOf=entries=>entries.filter(e=>e.section==='odontogram'&&e.body.tooth&&e.body.findings);
export function markFindings(container,entries,selection={}){
 for(const b of container.querySelectorAll('[data-tooth]button,button[data-tooth]')){
 const tooth=b.dataset.tooth,face=b.dataset.surface||'all';
 const saved=entries.some(e=>String(e.body.tooth)===tooth&&(facesOf(e.body).includes(face)||facesOf(e.body).includes('all')));
 const selected=(selection[tooth]||[]).includes(face);
 b.classList.toggle('selected',selected||saved);b.setAttribute('aria-pressed',String(selected||saved));
 b.style.outline=selected?'2px solid #287c9a':'';
 }
}
