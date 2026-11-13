export default async ({frame})=>{await frame.evaluate(()=>window.__ANTVR.app.run.resume());return {resumed:true};};
