import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/* Глобальный WebSocket есть не в каждой сборке Node 20 — без него скрипт
   падал бы с невнятным ReferenceError уже после запуска Chrome */
if (typeof WebSocket === "undefined") {
  console.error(
    `нужен Node с глобальным WebSocket (22+); сейчас ${process.version}`,
  );
  process.exit(1);
}

const DIR = path.resolve(import.meta.dirname, "..");
const OUT = path.join(DIR, "out");
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const RM = argv.includes("--reduced-motion");
const FILE = path.resolve(
  DIR,
  argv.find((a) => !a.startsWith("--")) || "index.html",
);
if (!fs.existsSync(FILE)) {
  console.error(`нет файла: ${FILE}`);
  process.exit(1);
}
const PORT = 9350 + Math.floor(Math.random() * 90);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-smoke-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--hide-scrollbars",
    "--disable-gpu",
    "--no-sandbox",
    "--force-device-scale-factor=1",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome не поднялся");
}
const ws = new WebSocket(await endpoint());
await new Promise((r) => ws.addEventListener("open", r));
const pending = new Map(),
  listeners = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method) listeners.forEach((f) => f(m));
});
const raw = (me, pa = {}, si) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method: me, params: pa, sessionId: si }));
  });
const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
const { sessionId } = await raw("Target.attachToTarget", {
  targetId,
  flatten: true,
});
const S = (m, p) => raw(m, p, sessionId);

const errs = [];
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === "Runtime.exceptionThrown")
    errs.push(
      m.params.exceptionDetails.exception?.description ||
        m.params.exceptionDetails.text,
    );
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errs.push("console: " + m.params.args.map((a) => a.value).join(" "));
});
const requests = [];
listeners.push((m) => {
  if (m.sessionId === sessionId && m.method === "Network.requestWillBeSent")
    requests.push(m.params.request.url);
});
await S("Network.enable");
await S("Runtime.enable");
await S("Page.enable");
if (RM)
  await S("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
await S("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await S("Page.navigate", { url: "file://" + FILE });
await new Promise((r) =>
  listeners.push((m) => {
    if (m.sessionId === sessionId && m.method === "Page.loadEventFired") r();
  }),
);
await S("Runtime.evaluate", {
  expression: "document.fonts.ready",
  awaitPromise: true,
});
await sleep(500);

const ev = async (e) =>
  (await S("Runtime.evaluate", { expression: e, returnByValue: true })).result
    .value;
async function waitFor(expression, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await ev(expression)) return;
    await sleep(50);
  }
  throw new Error("Timed out: " + expression);
}
const ready = `!!document.querySelector('.loading-screen button') && !document.querySelector('.loading-screen button').disabled`;
const results = [];
const check = (name, pass, got = "") => {
  results.push(pass);
  console.log(
    `  ${pass ? "ok  " : "ПЛОХО"}  ${name}${pass ? "" : "  -> " + got}`,
  );
};
async function key(k, code, vk) {
  for (const type of ["keyDown", "keyUp"])
    await S("Input.dispatchKeyEvent", {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
    });
  await sleep(190);
}

try {
  check(
    "mandatory loader visible",
    await ev(
      `!!document.querySelector('.loading-screen') && document.querySelector('#game').hidden`,
    ),
  );
  await S("Page.captureScreenshot", { format: "png" }).then((r) =>
    fs.writeFileSync(
      path.join(OUT, "loading.png"),
      Buffer.from(r.data, "base64"),
    ),
  );
  check(
    "ready without artificial timer",
    await ev(`!document.querySelector('.loading-screen button').disabled`),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('.loading-screen button').click()`,
  });
  check(
    "loader iframe destroyed",
    await ev(`!document.querySelector('iframe')`),
  );
  check("onboarding opens", await ev(`document.querySelector('#modal').open`));
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#help-done').click()`,
  });
  check("game visible", await ev(`!document.querySelector('#game').hidden`));
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  const initial = await ev(
    `JSON.parse(localStorage.getItem('kernel-valley-v1')).player.x`,
  );
  await S("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(170);
  await S("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  check(
    "keyboard moves android",
    (await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).player.x`,
    )) > initial,
  );
  // Click farm, allow pathfinding to reach and plant it.
  const clickTile = async (x, y) => {
    const r = await ev(
      `(()=>{const r=document.querySelector('#world').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await S("Input.dispatchMouseEvent", {
        type,
        x: r.x + ((x + 0.5) / 24) * r.w,
        y: r.y + ((y + 0.5) / 18) * r.h,
        button: "left",
        clickCount: 1,
      });
  };
  await clickTile(4, 8);
  await sleep(1700);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  check(
    "click pathfinding plants crop",
    await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).plots[0].age >= 0`,
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#build-belt').click()`,
  });
  for (let x = 16; x <= 20; x++) await clickTile(x, 9);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#build-factory').click()`,
  });
  await clickTile(21, 9);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  check(
    "construction through UI",
    await ev(
      `KernelCore.connected(JSON.parse(localStorage.getItem('kernel-valley-v1')))`,
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#build-factory').click();document.querySelector('#pause').click()`,
  });
  const before = await ev(
    `JSON.parse(localStorage.getItem('kernel-valley-v1')).time`,
  );
  await sleep(400);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  check(
    "pause freezes simulation",
    (await ev(`JSON.parse(localStorage.getItem('kernel-valley-v1')).time`)) ===
      before,
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#pause').click()`,
  });
  await S("Page.captureScreenshot", { format: "png" }).then((r) =>
    fs.writeFileSync(
      path.join(OUT, "desktop.png"),
      Buffer.from(r.data, "base64"),
    ),
  );
  await S("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(100);
  check(
    "mobile no horizontal overflow",
    await ev(`document.documentElement.scrollWidth <= innerWidth`),
  );
  check(
    "mobile controls visible",
    await ev(
      `getComputedStyle(document.querySelector('.touch-controls')).display !== 'none'`,
    ),
  );
  await S("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  }).then((r) =>
    fs.writeFileSync(
      path.join(OUT, "mobile.png"),
      Buffer.from(r.data, "base64"),
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#save').click()`,
  });
  const oldBuilds = await ev(
    `JSON.parse(localStorage.getItem('kernel-valley-v1')).builds.length`,
  );
  await S("Page.reload");
  await waitFor(ready);
  check(
    "reload still shows mandatory loader",
    await ev(`!!document.querySelector('.loading-screen')`),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('.loading-screen button').click();document.querySelector('#save').click()`,
  });
  check(
    "save survives reload",
    (await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).builds.length`,
    )) === oldBuilds,
  );
  // Isolated saved-state fixtures exercise modal UI without bypassing its handlers.
  const fixture = async (extra) => {
    const data = await ev(
      `(()=>{const v=KernelCore.create(42);v.time=10;${extra};return JSON.stringify(v);})()`,
    );
    const { identifier } = await S("Page.addScriptToEvaluateOnNewDocument", {
      source: `if(window.top===window) localStorage.setItem('kernel-valley-v1',${JSON.stringify(data)})`,
    });
    await S("Page.reload");
    await waitFor(ready);
    await S("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    await S("Runtime.evaluate", {
      expression: `document.querySelector('.loading-screen button').click()`,
    });
  };
  await fixture("v.player.x=12;v.player.y=5");
  await key("e", "KeyE", 69);
  check(
    "workshop opens via interaction",
    await ev(`document.querySelectorAll('[data-pixel]').length===64`),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('[data-pixel="0"]').click();document.querySelector('#art-save').click()`,
  });
  check(
    "drawing saved",
    await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).drone[0]===1`,
    ),
  );
  await fixture("v.player.x=8;v.player.y=5");
  await key("e", "KeyE", 69);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#hire').click()`,
  });
  check(
    "hiring through shop",
    await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).helper===true`,
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#close-modal').click()`,
  });
  await fixture("v.player.x=19;v.player.y=5;v.patches=1");
  await key("e", "KeyE", 69);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#answer-0').click()`,
  });
  check(
    "quiz wrong answer explains",
    await ev(
      `document.querySelector('#feedback').textContent.includes('Небезопасный')`,
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#answer-1').click()`,
  });
  check(
    "quiz repair saved",
    await ev(
      `JSON.parse(localStorage.getItem('kernel-valley-v1')).solved.includes(0)`,
    ),
  );
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#close-modal').click()`,
  });
  await fixture("v.player.x=4;v.player.y=5");
  await key("e", "KeyE", 69);
  await S("Runtime.evaluate", {
    expression: `document.querySelector('#upgrade').click()`,
  });
  check(
    "home upgrade via UI",
    await ev(`JSON.parse(localStorage.getItem('kernel-valley-v1')).home===1`),
  );
  check(
    "zero remote requests",
    requests.every((url) => url.startsWith("file:") || url.startsWith("data:")),
    requests.filter((url) => !url.startsWith("file:")).join("; "),
  );
  check("no JS exceptions", errs.length === 0, errs.join("; "));
  if (results.some((r) => !r)) process.exitCode = 1;
} finally {
  await Promise.race([raw("Browser.close").catch(() => {}), sleep(2000)]);
  if (chrome.exitCode === null) {
    await Promise.race([new Promise(resolve => chrome.once("exit", resolve)), sleep(2000)]);
  }
  ws.close();
  if (chrome.exitCode === null) chrome.kill();
  await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
