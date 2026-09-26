const http = require("node:http");
const { handle } = require("./service.cjs");
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.writeHead(405);
      return res.end(JSON.stringify({ error: "Read-only API" }));
    }
    const url = new URL(req.url, "http://localhost");
    try {
      const result = await handle(
        url.pathname.replace(/^\/api\//, ""),
        url.searchParams,
      );
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(e.status || 502);
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(Number(process.env.PORT) || 3002, "127.0.0.1", () =>
    console.log(
      "Folio backend: http://localhost:" + (process.env.PORT || 3002),
    ),
  );
