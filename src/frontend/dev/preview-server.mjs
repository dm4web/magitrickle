import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 6969;
const API = "/api/v1";
const original = JSON.parse(readFileSync(new URL("./preview-data.json", import.meta.url), "utf8"));
let groups = structuredClone(original.groups);
let scenario = "primary";
const scenarios = new Set(["primary", "backup", "blackhole", "pending"]);

const interfaces = {
  interfaces: [
    { id: "nwg0", name: "Основной VPN (демо)" },
    { id: "eth1", name: "Резервный WAN (демо)" },
    { id: "wg0", name: "Дополнительный туннель (демо)" },
    { id: "blackhole", name: "Блокировать трафик" },
  ],
};
let subscriptions = [
  {
    id: "e1f2a3b4",
    name: "Тестовая подписка",
    interface: "wg0",
    enable: true,
    url: "https://example.com/demo-rules",
    lastUpdate: Math.floor(Date.now() / 1000),
    interval: 86400,
    rules: [{ id: "aabbccdd", rule: "example.org", type: "domain", enable: true }],
  },
];

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let value = "";
    req.on("data", (chunk) => {
      value += chunk;
      if (value.length > 1000000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(value ? JSON.parse(value) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function routingStatuses() {
  return groups.map((group) => {
    const candidates = [group.interface, ...(group.fallback_interfaces ?? [])];
    const hasBackup = candidates.length > 1 && group.enable;
    const mode = hasBackup ? scenario : "primary";
    const active =
      mode === "backup" ? candidates[1] : mode === "blackhole" ? "blackhole" : group.interface;
    const selected = mode === "pending" ? candidates[1] : active;
    return {
      id: group.id,
      enabled: group.enable,
      primary_interface: group.interface,
      active_interface: active,
      selected_interface: selected,
      applied: mode !== "pending",
      check_target: group.check_target ?? "",
      failover: candidates.length > 1,
      interfaces: candidates.map((name, index) => {
        const healthy = mode === "primary" || (index !== 0 && mode !== "blackhole");
        return {
          interface: name,
          checked: true,
          healthy,
          method: group.check_target ? "tcp" : "link",
          detail: healthy ? "Simulation: healthy" : "Simulation: unavailable",
        };
      }),
    };
  });
}

const demoHtml = [
  "<!doctype html><html lang='ru'><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width, initial-scale=1'>",
  "<title>MagiTrickle — Управление симуляцией</title>",
  "<style>",
  ":root{color-scheme:dark;font:16px system-ui,sans-serif;background:#1a1b26;color:#c0caf5}",
  "body{max-width:720px;margin:2.5rem auto;padding:0 1.25rem}",
  "h1{color:#7aa2f7}p{color:#a9b1d6;line-height:1.55}",
  "button,a{display:inline-block;margin:5px;padding:12px 16px;border:1px solid #565f89;border-radius:10px;background:#24283b;color:#c0caf5;text-decoration:none;cursor:pointer}",
  "button:hover,a:hover{border-color:#7aa2f7}button.active{border-color:#9ece6a;background:#293f31}",
  "small{display:block;margin-top:20px;color:#9aa2c1}",
  "</style>",
  "<h1>MagiTrickle · Demo</h1>",
  "<p>Безопасная симуляция: реальные интерфейсы, маршруты и Keenetic не используются.</p>",
  "<p><a href='http://127.0.0.1:5173' target='_blank' rel='noopener'>Открыть MagiTrickle</a></p>",
  "<div id='controls'>",
  "<button data-scenario='primary'>Основной интерфейс</button>",
  "<button data-scenario='backup'>Резервный интерфейс</button>",
  "<button data-scenario='blackhole'>Все интерфейсы недоступны</button>",
  "<button data-scenario='pending'>Не удалось применить маршрут</button>",
  "</div>",
  "<p role='status' id='status'></p>",
  "<button id='reset'>Сбросить тестовую конфигурацию</button>",
  "<small>На основной странице изменения статусов появятся в течение 5 секунд. Для возврата исходных групп нажми «Сбросить» и обнови интерфейс.</small>",
  "<script>",
  "const labels={primary:'Основной',backup:'Резервный',blackhole:'Blackhole',pending:'Ошибка применения'};",
  "async function update(){",
  " const state=await (await fetch('/demo/state')).json();",
  " document.querySelectorAll('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===state.scenario));",
  " document.getElementById('status').textContent='Текущее состояние: '+labels[state.scenario]+' · групп: '+state.groups;",
  "}",
  "document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',async()=>{",
  " await fetch('/demo/scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:b.dataset.scenario})});",
  " await update();",
  "}));",
  "document.getElementById('reset').addEventListener('click',async()=>{",
  " await fetch('/demo/reset',{method:'POST'});await update();",
  "});",
  "update();",
  "</script></html>",
].join("\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  try {
    if (req.method === "GET" && path === "/demo") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(demoHtml);
      return;
    }
    if (req.method === "GET" && path === "/demo/state") {
      send(res, 200, { scenario, groups: groups.length });
      return;
    }
    if (req.method === "POST" && path === "/demo/scenario") {
      const body = await readBody(req);
      if (!scenarios.has(body.scenario)) return send(res, 400, { error: "Unknown scenario" });
      scenario = body.scenario;
      return send(res, 200, { scenario });
    }
    if (req.method === "POST" && path === "/demo/reset") {
      groups = structuredClone(original.groups);
      scenario = "primary";
      return send(res, 200, { status: "ok" });
    }
    if (path === API + "/auth" && req.method === "GET") return send(res, 200, { enabled: false });
    if (path === API + "/system/interfaces" && req.method === "GET")
      return send(res, 200, interfaces);
    if (path === API + "/system/routing-status" && req.method === "GET")
      return send(res, 200, { groups: routingStatuses() });
    if (path === API + "/groups" && req.method === "GET") return send(res, 200, { groups });
    if (path === API + "/groups" && req.method === "PUT") {
      const body = await readBody(req);
      if (!Array.isArray(body.groups)) return send(res, 400, { error: "Expected groups" });
      groups = structuredClone(body.groups);
      return send(res, 200, { status: "ok" });
    }
    if (path === API + "/subscriptions" && req.method === "GET")
      return send(res, 200, { subscriptions });
    if (path === API + "/subscriptions" && req.method === "PUT") {
      const body = await readBody(req);
      if (!Array.isArray(body.subscriptions))
        return send(res, 400, { error: "Expected subscriptions" });
      subscriptions = structuredClone(body.subscriptions);
      return send(res, 200, { status: "ok" });
    }
    if (path === API + "/subscriptions" && req.method === "POST") {
      subscriptions.unshift(await readBody(req));
      return send(res, 200, { status: "ok" });
    }
    if (path.startsWith(API + "/subscriptions/") && req.method === "DELETE") {
      const id = decodeURIComponent(path.slice((API + "/subscriptions/").length));
      subscriptions = subscriptions.filter((item) => item.id !== id);
      return send(res, 200, { status: "ok" });
    }
    if (path === API + "/subscriptions/rules" && req.method === "GET") {
      return send(res, 200, {
        rules: [{ id: "aabbccdd", rule: "example.org", type: "domain", enable: true }],
      });
    }
    if (
      path.startsWith(API + "/subscriptions/") &&
      path.endsWith("/sync") &&
      req.method === "POST"
    ) {
      return send(res, 200, {
        rules: [{ id: "aabbccdd", rule: "example.org", type: "domain", enable: true }],
        lastUpdate: Math.floor(Date.now() / 1000),
      });
    }
    if (path === API + "/logs" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      let id = 0;
      const interval = setInterval(() => {
        res.write(
          "id:" +
            ++id +
            "\ndata:" +
            JSON.stringify({
              level: "info",
              time: new Date().toISOString(),
              message: "Simulation: " + scenario,
            }) +
            "\n\n",
        );
      }, 3500);
      req.on("close", () => clearInterval(interval));
      return;
    }
    return send(res, 404, { error: "Unknown demo API path", path });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) return send(res, 400, { error: "Invalid demo request" });
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log("Local-only demo API: http://" + HOST + ":" + PORT + "/demo");
  console.log("Test data is held only in memory; no router connections.");
});
