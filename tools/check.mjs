import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderReadmes } from './generate-readmes.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const catalog=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
const files=[];
for(const directory of ['server','public','tools','tests'])for(const file of readdirSync(new URL('../'+directory+'/',import.meta.url)))if(/\.(mjs|js)$/.test(file))files.push(directory+'/'+file);
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
assert.equal(catalog.studies.length,21);
assert.equal(catalog.studies.filter(study=>study.classroomEnabled).length,14);
for(const study of catalog.studies){
  for(const lang of ['ja','zh','en']){
    assert(study.original[lang]?.length>10,study.id+' original '+lang);
    assert(study.changes[lang]?.length>10,study.id+' changes '+lang);
    assert(study.names[lang]?.length>2,study.id+' name '+lang);
    assert(study.audit.reason[lang]?.length>10,study.id+' audit '+lang);
  }
  for(const key of study.sourceKeys)assert(catalog.sources[key]?.url.startsWith('https://'),study.id+' source');
}
for(const [file,content] of Object.entries(renderReadmes(catalog)))assert.equal(readFileSync(new URL('../'+file,import.meta.url),'utf8'),content,file+' is stale: run npm run docs');
console.log('Checked '+files.length+' JavaScript files, 21 catalog entries and all three generated READMEs.');
