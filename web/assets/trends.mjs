import { trendWindow } from "./calculations.mjs";

export function initializeViews(bundle, refreshHourly) {
  const $ = (id) => document.getElementById(id);
  let chart;
  const number = (n) =>
    n.toLocaleString("es-ES", {
      minimumFractionDigits: 5,
      maximumFractionDigits: 5,
    });
  function render() {
    if ($("trends-panel").hidden) return;
    const count = Number($("trend-count").value);
    if (!Number.isInteger(count) || count < 1 || count > 90) {
      $("trend-count").setCustomValidity(
        "Introduce un número entero entre 1 y 90.",
      );
      $("trend-count").reportValidity();
      return;
    }
    $("trend-count").setCustomValidity("");
    const rows = trendWindow(bundle, count),
      available = rows.filter((r) => r.status === "available");
    const factor = Number($("unit").value),
      unit = factor === 1 ? "€/kWh" : "cént./kWh";
    $("trend-status").textContent =
      `${bundle.days[0]?.demo ? "DEMOSTRACIÓN · Datos de prueba. " : ""}${rows[0].date} – ${rows.at(-1).date} · ${available.length} de ${count} días disponibles. ${available.length ? "Media aritmética de los precios horarios publicados, sin impuestos." : "Datos de tendencias no disponibles."}`;
    $("trend-caption").textContent =
      `Precios en ${unit}, sin impuestos. Cada media usa las 23, 24 o 25 horas publicadas del día.`;
    $("trend-rows").replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement("tr");
        const cells = [
          row.date,
          ...["min", "mean", "max"].map((key) =>
            row.status === "available" ? number(row[key] * factor) : "—",
          ),
          row.intervals ?? "—",
        ];
        cells.forEach((value) => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        });
        const source = document.createElement("td");
        if (row.status === "available") {
          const link = document.createElement("a");
          link.href = row.source_url;
          link.textContent = "ESIOS ↗";
          source.append(link);
          const stamp = document.createElement("small");
          stamp.textContent = `Consultado: ${new Date(row.retrieved_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`;
          source.append(stamp);
        } else source.textContent = "No disponible";
        tr.append(source);
        return tr;
      }),
    );
    if (chart) chart.destroy();
    chart = null;
    $("trend-chart").hidden = !available.length || !globalThis.Chart;
    if (!available.length || !globalThis.Chart) return;
    const style = getComputedStyle(document.body),
      color = style.getPropertyValue("--muted").trim();
    chart = new Chart($("trend-chart"), {
      type: "line",
      data: {
        labels: rows.map((r) => r.date),
        datasets: [
          ["Mínimo", "min", color],
          ["Máximo", "max", color],
          ["Media", "mean", style.getPropertyValue("--accent").trim()],
        ].map(([label, key, borderColor], index) => ({
          label,
          data: rows.map((r) =>
            r.status === "available" ? r[key] * factor : null,
          ),
          borderColor,
          borderWidth: index === 2 ? 3 : 1,
          pointRadius: count <= 7 ? 2 : 0,
          pointHitRadius: 12,
          spanGaps: false,
          tension: 0,
          fill: index === 1 ? "-1" : false,
          backgroundColor: document.body.classList.contains("dark")
            ? "rgba(210,220,230,.16)"
            : "rgba(65,80,100,.12)",
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color } },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${number(ctx.parsed.y)} ${unit}`,
              afterBody: (items) =>
                items.length
                  ? [
                      `${rows[items[0].dataIndex].intervals} intervalos horarios`,
                    ]
                  : [],
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color,
              maxTicksLimit: 8,
              maxRotation: 0,
              callback(value) {
                return rows[value].date.slice(5).split("-").reverse().join("/");
              },
            },
            grid: { display: false },
          },
          y: {
            ticks: { color },
            title: { display: true, text: unit, color },
            grid: { color: style.getPropertyValue("--border").trim() },
          },
        },
      },
    });
  }
  const tabs = [$("hourly-tab"), $("trends-tab")];
  function activate(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      tab.classList.toggle("active", i === index);
    });
    $("hourly-panel").hidden = index !== 0;
    $("trends-panel").hidden = index !== 1;
    if (index === 0) refreshHourly();
    else render();
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => activate(index);
    tab.onkeydown = (event) => {
      const keys = {
        ArrowRight: 1 - index,
        ArrowLeft: 1 - index,
        Home: 0,
        End: 1,
      };
      if (Object.hasOwn(keys, event.key)) {
        event.preventDefault();
        activate(keys[event.key], true);
      }
    };
  });
  $("trend-count").addEventListener("input", render);
  for (const button of document.querySelectorAll("[data-trend-days]"))
    button.onclick = () => {
      $("trend-count").value = button.dataset.trendDays;
      render();
    };
  $("trend-unit").onchange = () => {
    $("unit").value = $("trend-unit").value;
    $("unit").dispatchEvent(new Event("change"));
  };
  return {
    render() {
      $("trend-unit").value = $("unit").value;
      render();
    },
  };
}
