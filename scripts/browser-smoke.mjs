import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(
  "python",
  ["-m", "http.server", "8127", "--bind", "127.0.0.1"],
  { stdio: "ignore" },
);
const browser = spawn(
  process.env.CHROMIUM || "chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=9227",
    "--user-data-dir=/tmp/vottle-browser-profile",
  ],
  { stdio: "ignore" },
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
const mismatch = process.argv.includes("--calendar-mismatch");
try {
  let tab;
  for (let i = 0; i < 60; i++) {
    try {
      tab = await (
        await fetch(
          "http://127.0.0.1:9227/json/new?http://127.0.0.1:8127/dist/",
          { method: "PUT" },
        )
      ).json();
      break;
    } catch {
      await delay(250);
    }
  }
  assert.ok(tab, "Browser must start");
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, (msg) =>
        msg.error ? reject(msg.error) : resolve(msg.result),
      );
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1550,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(1800);
  const state = await evaluate(
    `({hidden:document.querySelector('#dashboard').hidden, rows:document.querySelectorAll('#rows tr').length, chart:Chart.getChart(document.querySelector('#chart')).data.datasets.length, cost:document.querySelector('#cost-a').textContent, notice:document.querySelector('#notice').textContent})`,
  );
  assert.equal(state.hidden, false);
  assert.equal(state.rows, 24);
  assert.equal(state.chart, 3);
  assert.ok(state.cost.includes("€"));
  assert.ok(
    mismatch
      ? state.notice.includes("ESIOS publica")
      : /desactualizados|DEMOSTRACIÓN/.test(state.notice),
  );
  console.log("Desktop subpath render:", state);
  await evaluate(
    `document.querySelector('#detail').click(); document.querySelector('#consumption').value='2';document.querySelector('#consumption').dispatchEvent(new Event('input'));document.querySelector('#theme').click()`,
  );
  assert.equal(
    await evaluate(
      `Chart.getChart(document.querySelector('#chart')).data.datasets.length`,
    ),
    mismatch ? 3 : 4,
  );
  if (mismatch) {
    assert.equal(
      await evaluate(`document.querySelector('#detail').disabled`),
      true,
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('#rows tr')[8].cells[1].textContent`,
      ),
      "Sin verificar",
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('#rows tr')[8].cells[3].textContent`,
      ),
      "—",
    );
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#chart')).data.datasets[1].data[8]`,
      ),
      0.00329,
    );
  }
  await delay(600);
  const shot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  if (!mismatch)
    await writeFile("docs/preview.png", Buffer.from(shot.data, "base64"));
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(500);
  assert.ok(
    await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),
    "No mobile page overflow",
  );
  await evaluate(`document.querySelector('#tomorrow').click()`);
  assert.ok(
    await evaluate(
      `document.querySelector('#notice').textContent.includes('aún no están publicados')`,
    ),
  );
  assert.equal(
    await evaluate(`document.querySelector('#dashboard').hidden`),
    true,
  );
  console.log(
    "PASS: detail, calculator, theme, mobile width and unavailable tomorrow controls",
  );
} finally {
  ws?.close();
  browser.kill();
  server.kill();
}
