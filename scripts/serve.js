// 极简静态文件服务器：把 frontend 目录托管到局域网，供手机等设备访问
// 用法: node scripts/serve.js  （默认端口 8000，绑定 0.0.0.0）
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "frontend");
const PORT = 8000;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); } // 防路径穿越
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404 Not Found"); }
    // 不缓存：改完代码刷新就能看到最新页面（否则浏览器可能一直用旧的合约地址）
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log(`静态服务已启动: http://0.0.0.0:${PORT}`));
