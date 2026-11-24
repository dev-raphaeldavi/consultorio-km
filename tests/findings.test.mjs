import test from 'node:test';
import assert from 'node:assert/strict';
import {markFindings} from '../src/findings.js';

const button=(tooth,surface='all')=>({dataset:{tooth,surface},classList:{values:new Set(),toggle(name,on){on?this.values.add(name):this.values.delete(name);}},style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;}});

test('odontograma pinta todas as faces salvas e a seleção atual',()=>{
 const buttons=[button('16','M'),button('16','O'),button('16','V'),button('18','V')];
 const container={querySelectorAll(selector){assert.equal(selector,'button[data-tooth]');return buttons;}};
 const entries=[{section:'odontogram',body:{tooth:'16',surface:'M,O',findings:'Cárie'}}];
 markFindings(container,entries,{'18':['V']});
 assert.deepEqual(buttons.map(b=>b.classList.values.has('selected')),[true,true,false,true]);
 assert.equal(buttons[0].attributes['aria-pressed'],'true');
 assert.equal(buttons[2].attributes['aria-pressed'],'false');
 assert.equal(buttons[3].style.outline,'2px solid #287c9a');
});
