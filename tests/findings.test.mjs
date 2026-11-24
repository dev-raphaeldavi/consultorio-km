import test from 'node:test';
import assert from 'node:assert/strict';
import {findingsOf,markFindings} from '../src/findings.js';

const button=(tooth,surface='all')=>({dataset:{tooth,surface},classList:{values:new Set(),toggle(name,on){on?this.values.add(name):this.values.delete(name);}},style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;}});

test('odontograma pinta todas as faces salvas e a seleção atual',()=>{
 const buttons=[button('16'),button('16','M'),button('16','O'),button('16','V'),button('18'),button('18','V')];
 const container={querySelectorAll(selector){assert.equal(selector,'button[data-tooth]');return buttons;}};
 const entries=[{section:'odontogram',body:{tooth:'16',surface:'M,O',findings:'Cárie'}}];
 markFindings(container,entries,{'18':['V']});
 assert.deepEqual(buttons.map(b=>b.classList.values.has('selected')),[true,true,true,false,true,true]);
 assert.equal(buttons[0].attributes['aria-pressed'],'true');
 assert.equal(buttons[3].attributes['aria-pressed'],'false');
 assert.equal(buttons[4].style.outline,'');
});

test('edição e exclusão preservam histórico, mas retornam só achados ativos',()=>{
 const rows=[
  {id:'1',section:'odontogram',body:{tooth:'16',surface:'M',findings:'Cárie'}},
  {id:'2',section:'odontogram',body:{tooth:'16',surface:'M,O',findings:'Cárie profunda',supersedes:'1'}},
  {id:'3',section:'odontogram',body:{tooth:'18',surface:'V',findings:'Lesão'}},
  {id:'4',section:'odontogram',body:{tooth:'18',surface:'V',findings:'Lesão',supersedes:'3',voided:true}}
 ];
 assert.deepEqual(findingsOf(rows).map(e=>e.id),['2']);
});
