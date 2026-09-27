const http = require("node:http");
const config = require("./config.cjs");
const { handle } = require("./service.cjs");

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, HEAD" });
    return res.end(JSON.stringify({ error: { code: "method_not_allowed", message: "Use GET." } }));
  }
  const { status, body, cause } = await handle(req.url);
  if (cause) console.error(cause);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
  console.info(`${status} ${req.url.split("?")[0]} ${Date.now() - start}ms`);
});

server.listen(config.port, () => {
  console.info(`Aggregator API on http://localhost:${config.port}/v1`);
});
