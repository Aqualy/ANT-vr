export default async ({frame,page}) => {
 return {outer:await page.evaluate(()=>[...document.body.children].map(e=>({tag:e.tagName,id:e.id,cls:e.className,shadow:!!e.shadowRoot}))),inner:await frame.evaluate(()=>[...document.body.children].filter(e=>e.shadowRoot).map(e=>({style:e.getAttribute('style'),html:e.shadowRoot.innerHTML.slice(0,700)})))};
};
