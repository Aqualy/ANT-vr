export default async ({frame}) => {
  await frame.waitForFunction(()=>window.__ANTVR?.ready,{timeout:60000});
  return frame.evaluate(()=>({snapshot:window.__ANTVR.snapshot(),error:document.querySelector('#error')?.hidden===false,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
};
