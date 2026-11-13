import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
export default async ({frame,workspaceRoot})=>{
 const s=await frame.evaluate(()=>{const s=window.__ANTVR.snapshot();window.__ANTVR.app.run.pause();return s;});
 assert.equal(s.step,'kit');assert.equal(s.action,'open-kit');assert.equal(s.timings[0].reason,'action');
 await mkdir(path.join(workspaceRoot,'evidence/native'),{recursive:true});await writeFile(path.join(workspaceRoot,'evidence/native/controller-ray.json'),JSON.stringify({passed:true,method:'Native IWER controller ray + trigger',snapshot:s},null,2));return {passed:true,step:s.step,reason:s.timings[0].reason};
};
