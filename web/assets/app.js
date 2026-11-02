import { statistics, cost, currentHour, madridDate } from "./calculations.mjs";
const $ = (id) => document.getElementById(id);
const decimal = (n, digits = 5) =>
  n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const money = (n) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 4,
  });
let bundle, selected, chart;
const media = matchMedia("(prefers-color-scheme: dark)");
let override = false;
function theme(dark) {
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("light", !dark);
  if (selected) render();
}
theme(media.matches);
media.addEventListener("change", (e) => {
  if (!override) theme(e.matches);
});
$("theme").onclick = () => {
  override = true;
  theme(!document.body.classList.contains("dark"));
};
function calculate() {
  try {
    const raw = $("consumption").value;
    if (!raw.trim()) throw new Error();
    const kwh = Number(raw),
      a = selected.hours[Number($("hour-a").value)],
      b = selected.hours[Number($("hour-b").value)];
    const first = cost(kwh, a.total),
      second = cost(kwh, b.total);
    $("cost-a").textContent = money(first);
    $("cost-b").textContent = money(second);
    $("saving").textContent =
      `Diferencia entre las dos horas: ${money(Math.abs(first - second))}`;
  } catch {
    $("cost-a").textContent = "—";
    $("cost-b").textContent = "—";
    $("saving").textContent =
      "Introduce un consumo válido entre 0 y 1.000.000 kWh.";
  }
}
const periods = { punta: "#e6b87d", llano: "#adc7dc", valle: "#a8d8c7" };
const shading = {
  id: "periods",
  beforeDraw(c) {
    const {
      ctx,
      chartArea: a,
      scales: { x },
    } = c;
    if (!a) return;
    ctx.save();
    selected.hours.forEach((h, i) => {
      const step = (a.right - a.left) / selected.hours.length;
      ctx.fillStyle = periods[h.period] + "24";
      ctx.fillRect(
        x.getPixelForValue(i) - step / 2,
        a.top,
        step,
        a.bottom - a.top,
      );
    });
    ctx.restore();
  },
};
function render() {
  const hours = selected.hours,
    stats = statistics(hours),
    now = currentHour(hours);
  $("dashboard").hidden = false;
  $("average").textContent = decimal(stats.average);
  $("minimum").textContent = decimal(stats.minimum.total);
  $("maximum").textContent = decimal(stats.maximum.total);
  $("cheapest").textContent = stats.minimum.label + " · €/kWh";
  $("expensive").textContent = stats.maximum.label + " · €/kWh";
  $("current").textContent = now ? decimal(now.total) : "—";
  $("current-label").textContent = now
    ? now.label + " · €/kWh"
    : "Fuera del día seleccionado";
  const source = new URL(selected.source_url);
  $("provenance").replaceChildren(
    document.createTextNode(
      `Datos: ${selected.date} · Recuperados: ${new Date(selected.retrieved_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} (Madrid). La fuente no indica una hora de publicación. `,
    ),
  );
  const link = document.createElement("a");
  link.href = source.href;
  link.textContent = "Archivo oficial ESIOS ↗";
  $("provenance").append(link);
  $("rows").replaceChildren(
    ...hours.map((h) => {
      const tr = document.createElement("tr");
      if (h === now) tr.className = "current";
      [
        h.label,
        h.period,
        ...["total", "peajes", "cargos", "remaining"].map((k) =>
          decimal(h[k], 6),
        ),
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });
      return tr;
    }),
  );
  for (const [id, initial] of [
    ["hour-a", stats.minimum],
    ["hour-b", stats.maximum],
  ]) {
    const previous = $(id).value;
    $(id).replaceChildren(
      ...hours.map((h, i) => new Option(h.label, String(i))),
    );
    $(id).value = previous || String(hours.indexOf(initial));
  }
  calculate();
  const factor = Number($("unit").value),
    detail = $("detail").checked;
  const style = getComputedStyle(document.body),
    color = style.getPropertyValue("--muted").trim();
  if (chart) chart.destroy();
  if (!globalThis.Chart) {
    $("notice").textContent =
      "El gráfico no se pudo cargar. Puedes consultar los precios en la tabla.";
    return;
  }
  const series = [
    [
      "PVPC total",
      "total",
      document.body.classList.contains("dark") ? "#6cd5b8" : "#007a67",
    ],
    ...(detail
      ? [
          ["Peajes", "peajes", "#bd8245"],
          ["Cargos", "cargos", "#8b77b5"],
        ]
      : [["Peajes + cargos", "regulated", "#bd8245"]]),
    ["Resto del PVPC", "remaining", "#6792b7"],
  ];
  chart = new Chart($("chart"), {
    type: "line",
    plugins: [shading],
    data: {
      labels: hours.map((h) => h.label),
      datasets: series.map(([label, key, borderColor]) => ({
        label,
        data: hours.map((h) => h[key] * factor),
        borderColor,
        borderWidth: key === "total" ? 3 : 1.7,
        pointRadius: hours.map((h) => (h === now ? 5 : 0)),
        pointHitRadius: 16,
        tension: 0,
        stepped: "middle",
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color,
            usePointStyle: true,
            boxWidth: 7,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${decimal(ctx.parsed.y, 6)} ${factor === 1 ? "€/kWh" : "cént./kWh"}`,
          },
        },
      },
      scales: {
        x: {
          offset: true,
          grid: { display: false },
          ticks: {
            color,
            maxTicksLimit: 8,
            maxRotation: 0,
            callback(value) {
              return hours[value].label.replace(":00", "");
            },
          },
        },
        y: {
          ticks: { color },
          grid: { color: style.getPropertyValue("--border").trim() },
          title: {
            display: true,
            text: factor === 1 ? "€/kWh" : "cént./kWh",
            color,
          },
        },
      },
    },
  });
}
function choose(index) {
  const target = madridDate(
    new Date(Date.parse(madridDate() + "T12:00:00Z") + index * 86400000),
  );
  const demo = bundle.days.some((d) => d.demo);
  const day = demo
    ? bundle.days[index]
    : bundle.days.find((d) => d.date === target) ||
      (index === 0 ? bundle.days[0] : undefined);
  selected = null;
  if (chart) {
    chart.destroy();
    chart = null;
  }
  $("dashboard").hidden = true;
  $("today").classList.toggle("active", index === 0);
  $("tomorrow").classList.toggle("active", index === 1);
  $("today").setAttribute("aria-pressed", String(index === 0));
  $("tomorrow").setAttribute("aria-pressed", String(index === 1));
  $("date").textContent = day?.date
    ? new Date(day.date + "T12:00:00+01:00").toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/Madrid",
      })
    : new Date(target + "T12:00:00Z").toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/Madrid",
      });
  if (!day || day.status !== "available") {
    $("notice").textContent =
      "Los precios de mañana aún no están publicados. Vuelve a consultar después de la próxima actualización.";
    return;
  }
  selected = day;
  $("notice").textContent = day.demo
    ? "DEMOSTRACIÓN · Datos de prueba. No utilizar para decidir consumos."
    : day.date !== madridDate() && index === 0
      ? "Datos desactualizados. No son los precios de hoy. Consulta la fecha y la última actualización."
      : "";
  $("hour-a").replaceChildren();
  $("hour-b").replaceChildren();
  render();
}
$("today").onclick = () => choose(0);
$("tomorrow").onclick = () => choose(1);
$("detail").onchange = () => {
  if (selected) render();
};
$("unit").onchange = () => {
  if (selected) render();
};
for (const id of ["consumption", "hour-a", "hour-b"])
  $(id).addEventListener("input", () => {
    if (selected) calculate();
  });
try {
  const response = await fetch(
    new URL("../data/prices.json", import.meta.url),
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  bundle = await response.json();
  if (
    bundle.schema_version !== 1 ||
    !Array.isArray(bundle.days) ||
    !bundle.days.length
  )
    throw new Error("Formato no compatible");
  choose(0);
} catch (error) {
  $("notice").textContent =
    `No se pudieron cargar los precios. Inténtalo más tarde. (${error.message})`;
}
setInterval(() => {
  if (selected) render();
}, 60000);
