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
  await cdp("Page.enable");
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
  const ticks = await evaluate(
    `Chart.getChart(document.querySelector('#chart')).scales.x.ticks.map(tick => tick.label)`,
  );
  assert.ok(ticks.length > 8, "Desktop shows more frequent hourly labels");
  assert.ok(
    ticks.every((label) => /^\d{2}:\d{2}$/.test(label)),
    "Axis labels omit timezone suffixes",
  );
  assert.ok(
    await evaluate(
      `Chart.getChart(document.querySelector('#chart')).data.labels.every(label => /CET|CEST/.test(label))`,
    ),
    "Tooltips retain timezone details",
  );
  assert.ok(state.cost.includes("€"));
  assert.ok(
    mismatch
      ? state.notice.includes("ESIOS publica")
      : /desactualizados|DEMOSTRACIÓN/.test(state.notice),
  );
  if (!mismatch) {
    const band = await evaluate(
      `Chart.getChart(document.querySelector('#chart')).options.plugins.historyRange.ranges.map(range => range ? {min:range.min,max:range.max,days:range.days} : null)`,
    );
    assert.equal(band.length, 24);
    assert.ok(band.every((range) => range && range.days === 7));
    assert.ok(
      await evaluate(
        `document.querySelector('#history-status').textContent.includes('7/7 días')`,
      ),
    );
    const bounds = await evaluate(
      `({min:Chart.getChart(document.querySelector('#chart')).options.scales.y.min,max:Chart.getChart(document.querySelector('#chart')).options.scales.y.max})`,
    );
    await evaluate(`document.querySelector('#history-range').click()`);
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#chart')).options.plugins.historyRange.enabled`,
      ),
      false,
    );
    assert.deepEqual(
      await evaluate(
        `({min:Chart.getChart(document.querySelector('#chart')).options.scales.y.min,max:Chart.getChart(document.querySelector('#chart')).options.scales.y.max})`,
      ),
      bounds,
    );
    await evaluate(
      `document.querySelector('#history-range').click();document.querySelector('#unit').value='100';document.querySelector('#unit').dispatchEvent(new Event('change'))`,
    );
    assert.ok(
      Math.abs(
        (await evaluate(
          `Chart.getChart(document.querySelector('#chart')).options.scales.y.max`,
        )) -
          bounds.max * 100,
      ) < 1e-10,
    );
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#chart')).options.plugins.historyRange.factor`,
      ),
      100,
    );
    const tooltip = await evaluate(
      `Chart.getChart(document.querySelector('#chart')).options.plugins.tooltip.callbacks.afterBody([{dataIndex:12}])`,
    );
    assert.ok(tooltip[0].includes("cént./kWh"));
    assert.ok(tooltip[1].includes("7/7 días"));
    await evaluate(
      `document.querySelector('#unit').value='1';document.querySelector('#unit').dispatchEvent(new Event('change'))`,
    );
  }
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
  await evaluate(
    `document.querySelector('#hourly-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`,
  );
  assert.equal(await evaluate(`document.activeElement.id`), "trends-tab");
  assert.equal(
    await evaluate(`document.querySelector('#trends-panel').hidden`),
    false,
  );
  assert.equal(
    await evaluate(
      `Chart.getChart(document.querySelector('#trend-chart')).data.labels.length`,
    ),
    30,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('#trend-rows tr').length`),
    30,
  );
  await evaluate(`document.querySelector('[data-trend-days="90"]').click()`);
  assert.equal(
    await evaluate(
      `Chart.getChart(document.querySelector('#trend-chart')).data.labels.length`,
    ),
    90,
  );
  assert.ok(
    await evaluate(
      `document.querySelector('#trend-status').textContent.includes('90 de 90')`,
    ),
  );
  const mean = await evaluate(
    `Chart.getChart(document.querySelector('#trend-chart')).data.datasets[2].data[0]`,
  );
  await evaluate(
    `document.querySelector('#trend-unit').value='100';document.querySelector('#trend-unit').dispatchEvent(new Event('change'))`,
  );
  assert.ok(
    Math.abs(
      (await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).data.datasets[2].data[0]`,
      )) -
        mean * 100,
    ) < 1e-9,
  );
  assert.equal(await evaluate(`document.querySelector('#unit').value`), "100");
  await evaluate(
    `document.querySelector('#trend-unit').value='1';document.querySelector('#trend-unit').dispatchEvent(new Event('change'));document.querySelector('[data-trend-days="30"]').click()`,
  );
  await delay(500);
  const trendShot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  if (!mismatch)
    await writeFile("docs/trends.png", Buffer.from(trendShot.data, "base64"));
  await evaluate(
    `document.querySelector('#trends-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`,
  );
  assert.equal(await evaluate(`document.activeElement.id`), "hourly-tab");
  assert.equal(
    await evaluate(`document.querySelector('#consumption').value`),
    "2",
  );
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
  if (!mismatch) {
    await evaluate(`document.querySelector('#trends-tab').click()`);
    assert.ok(
      await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),
      "Trends fits mobile width",
    );
    assert.ok(
      await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).width>0`,
      ),
    );
    await evaluate(
      `document.querySelector('#trend-count').value='1';document.querySelector('#trend-count').dispatchEvent(new Event('input'))`,
    );
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).data.labels.length`,
      ),
      1,
    );
    await evaluate(
      `document.querySelector('#trend-count').value='0';document.querySelector('#trend-count').dispatchEvent(new Event('input'))`,
    );
    assert.equal(
      await evaluate(`document.querySelector('#trend-count').checkValidity()`),
      false,
    );
    await evaluate(
      `document.querySelector('[data-trend-days="7"]').click();document.querySelector('#theme').click()`,
    );
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).data.labels.length`,
      ),
      7,
    );
    await evaluate(`document.querySelector('#hourly-tab').click()`);
  }
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
  if (!mismatch) {
    const inject = async (transform) => {
      const { identifier } = await cdp(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source: `
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
          const response = await originalFetch(...args);
          if (!String(args[0]).includes('prices.json')) return response;
          const data = await response.json();
          ${transform}
          return new Response(JSON.stringify(data), {status:200, headers:{'Content-Type':'application/json'}});
        };`,
        },
      );
      await cdp("Page.reload", { ignoreCache: true });
      await delay(1200);
      await cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    };
    await inject(
      `const tomorrow = structuredClone(data.days[0]);tomorrow.date=data.days[1].date;tomorrow.hours.forEach(hour=>hour.total+=0.5);data.days[1]=tomorrow;`,
    );
    const initial = await evaluate(
      `({min:Chart.getChart(document.querySelector('#chart')).options.scales.y.min,max:Chart.getChart(document.querySelector('#chart')).options.scales.y.max})`,
    );
    await evaluate(`document.querySelector('#tomorrow').click()`);
    assert.equal(
      await evaluate(`document.querySelector('#dashboard').hidden`),
      false,
    );
    assert.deepEqual(
      await evaluate(
        `({min:Chart.getChart(document.querySelector('#chart')).options.scales.y.min,max:Chart.getChart(document.querySelector('#chart')).options.scales.y.max})`,
      ),
      initial,
    );
    assert.ok(
      await evaluate(
        `document.querySelector('#history-status').textContent.includes('7/7 días')`,
      ),
    );
    await inject(`data.history = data.history.slice(0,2);`);
    assert.ok(
      await evaluate(
        `document.querySelector('#history-status').textContent.includes('2/7 días (referencia incompleta)')`,
      ),
    );
    await inject(`data.trends.at(-2).status='unavailable';`);
    await evaluate(`document.querySelector('#trends-tab').click()`);
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).data.datasets[2].data.at(-2)`,
      ),
      null,
    );
    assert.equal(
      await evaluate(
        `Chart.getChart(document.querySelector('#trend-chart')).data.datasets[2].spanGaps`,
      ),
      false,
    );
    await evaluate(`document.querySelector('#hourly-tab').click()`);
    await inject(`delete data.history; delete data.trends;`);
    assert.equal(
      await evaluate(`document.querySelector('#history-range').disabled`),
      true,
    );
    assert.ok(
      await evaluate(
        `document.querySelector('#history-status').textContent.includes('Referencia histórica no disponible')`,
      ),
    );
  }
  if (!mismatch) {
    await evaluate(`document.querySelector('#trends-tab').click()`);
    assert.ok(
      await evaluate(
        `document.querySelector('#trend-status').textContent.includes('Datos de tendencias no disponibles')`,
      ),
    );
  }
  console.log(
    "PASS: chart controls, mobile layout, historical coverage, tooltips and shared day scale",
  );
} finally {
  ws?.close();
  browser.kill();
  server.kill();
}
