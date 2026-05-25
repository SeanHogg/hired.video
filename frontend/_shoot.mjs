import WebSocket from 'ws';
import fs from 'fs';

async function shoot(url, outPath) {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params) => new Promise((resolve) => {
    const myId = ++id;
    const handler = (data) => {
      const m = JSON.parse(data);
      if (m.id === myId) { ws.off('message', handler); resolve(m.result); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  await new Promise(r => ws.on('open', r));
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' });
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 8000));
  const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(outPath, Buffer.from(cap.data, 'base64'));
  // Also find wides
  const r = await send('Runtime.evaluate', { expression: `
    (() => {
      const vw = window.innerWidth;
      const wides = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 2) {
          let p = el.parentElement, scroller = null;
          while (p && p !== document.body) {
            const pcs = getComputedStyle(p);
            if (['auto','scroll','hidden','clip'].includes(pcs.overflowX)) { scroller = p.tagName + '.' + (p.className||'').slice(0,30); break; }
            p = p.parentElement;
          }
          wides.push({ tag: el.tagName, cls: (typeof el.className==='string'?el.className:'').slice(0,80), w: Math.round(r.width), right: Math.round(r.right), scroller, text: (el.textContent||'').slice(0,30).replace(/\s+/g,' ') });
        }
      });
      const unScrolled = wides.filter(w => !w.scroller).slice(0, 20);
      return JSON.stringify({ vw, docW: document.documentElement.scrollWidth, wideOverflowed: unScrolled.length, samples: unScrolled }, null, 2);
    })()
  `, returnByValue: true });
  console.log(`=== ${url} ===`);
  console.log(r.result?.value || JSON.stringify(r));
  ws.close();
}

await shoot(process.argv[2], process.argv[3]);
process.exit(0);
