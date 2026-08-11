import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.SDLT_LOCAL_PORT || 8765);
const feedbackDirectory = path.join(root, "feedback");
const feedbackFile = path.join(feedbackDirectory, "issues.json");
const allowedTypes = new Set(["translation", "image", "answer", "content", "other"]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

await fsp.mkdir(feedbackDirectory, { recursive: true });
try {
  await fsp.access(feedbackFile);
} catch {
  await fsp.writeFile(feedbackFile, "[]\n", "utf8");
}

async function readFeedback() {
  const parsed = JSON.parse(await fsp.readFile(feedbackFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("feedback/issues.json 必须是 JSON 数组");
  return parsed;
}

async function writeFeedback(feedback) {
  await fsp.writeFile(feedbackFile, `${JSON.stringify(feedback, null, 2)}\n`, "utf8");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("请求内容超过 1 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function validateNewReport(report) {
  if (!report || typeof report !== "object") return "反馈格式无效";
  if (typeof report.id !== "string" || !/^FB-[A-Z0-9-]+$/.test(report.id)) return "反馈编号无效";
  if (report.question_id !== null && (typeof report.question_id !== "string" || !/^SDLT-\d{6}$/.test(report.question_id))) return "题目编号无效";
  if (!allowedTypes.has(report.type)) return "问题类型无效";
  if (typeof report.description !== "string" || !report.description.trim() || report.description.length > 10000) return "问题说明不能为空且不能超过 10000 字";
  return null;
}

async function handleFeedbackApi(request, response, pathname) {
  const id = pathname.startsWith(`${"/api/feedback"}/`) ? decodeURIComponent(pathname.slice("/api/feedback/".length)) : null;
  if (request.method === "GET" && pathname === "/api/feedback") {
    return sendJson(response, 200, { ok: true, feedback: await readFeedback() });
  }

  if (request.method === "POST" && pathname === "/api/feedback") {
    const report = await readJson(request);
    const error = validateNewReport(report);
    if (error) return sendJson(response, 400, { ok: false, error });
    const feedback = await readFeedback();
    if (feedback.some((item) => item.id === report.id)) return sendJson(response, 409, { ok: false, error: "反馈编号重复" });
    feedback.push({
      ...report,
      description: report.description.trim(),
      status: "open",
      created_at: Number.isNaN(Date.parse(report.created_at)) ? new Date().toISOString() : report.created_at,
    });
    await writeFeedback(feedback);
    return sendJson(response, 201, { ok: true, feedback });
  }

  if (request.method === "PATCH" && id) {
    const changes = await readJson(request);
    if (!["open", "resolved"].includes(changes.status)) return sendJson(response, 400, { ok: false, error: "反馈状态无效" });
    const feedback = await readFeedback();
    const report = feedback.find((item) => item.id === id);
    if (!report) return sendJson(response, 404, { ok: false, error: "没有找到反馈" });
    report.status = changes.status;
    report.updated_at = new Date().toISOString();
    await writeFeedback(feedback);
    return sendJson(response, 200, { ok: true, feedback });
  }

  if (request.method === "DELETE" && id) {
    const feedback = await readFeedback();
    const next = feedback.filter((item) => item.id !== id);
    if (next.length === feedback.length) return sendJson(response, 404, { ok: false, error: "没有找到反馈" });
    await writeFeedback(next);
    return sendJson(response, 200, { ok: true, feedback: next });
  }

  return sendJson(response, 405, { ok: false, error: "不支持的请求" });
}

async function serveStatic(request, response, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) return sendJson(response, 405, { ok: false, error: "不支持的请求" });
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const absolute = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return sendJson(response, 403, { ok: false, error: "禁止访问" });
  let stat;
  try {
    stat = await fsp.stat(absolute);
  } catch {
    return sendJson(response, 404, { ok: false, error: "文件不存在" });
  }
  if (!stat.isFile()) return sendJson(response, 404, { ok: false, error: "文件不存在" });
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(absolute).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(absolute).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (url.pathname === "/api/feedback" || url.pathname.startsWith("/api/feedback/")) {
      await handleFeedbackApi(request, response, url.pathname);
    } else {
      await serveStatic(request, response, url.pathname);
    }
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || "本地服务发生错误" });
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log(`SafeDrive DLT 本地题库已启动：${url}`);
  console.log(`反馈将保存到：${feedbackFile}`);
  console.log("关闭此窗口即可停止本地服务。");
  if (!process.argv.includes("--no-open") && process.platform === "win32") {
    const opener = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
    opener.unref();
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。题库可能已经启动，请打开 http://${host}:${port}/`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

