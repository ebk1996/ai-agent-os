const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const ALLOWED = /^(src\/|public\/)?[A-Za-z0-9._/-]+\.(jsx?|tsx?|css|json|html|svg|md)$/;
const ROOT_FILES = /^(package\.json|vite\.config\.js|index\.html|README\.md)$/;

function safePath(p) {
  const n = String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");
  if (!n || n.includes("..")) return null;
  if (ROOT_FILES.test(n) || ALLOWED.test(n)) return n;
  return null;
}

function extractAppFiles(text, parsed) {
  const files = [];
  const seen = new Set();
  const add = (p, content) => {
    const dest = safePath(p);
    if (!dest || !content || !String(content).trim()) return;
    if (seen.has(dest)) return;
    seen.add(dest);
    files.push({ path: dest, content: String(content).replace(/\n$/, "") + "\n" });
  };

  const json = parsed || {};
  const bag = json.app?.files || json.files || json.project?.files;
  if (Array.isArray(bag)) {
    for (const f of bag) add(f.path || f.name || f.file, f.content || f.code || f.source);
  }

  const fence = /```(?:jsx|tsx|javascript|js|css|json|html|vite)?[ \t]+([^\n]+)\n([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(text))) {
    const name = m[1].trim().replace(/^file:/, "");
    add(name, m[2]);
  }
  return files;
}

function defaults(slug, title) {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug || "agent007-app",
          private: true,
          version: "0.0.1",
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
          dependencies: { react: "^19.2.8", "react-dom": "^19.2.8" },
          devDependencies: { "@vitejs/plugin-react": "^6.1.0", vite: "^8.2.2" }
        },
        null,
        2
      ) + "\n"
    },
    {
      path: "vite.config.js",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], server: { port: 5174 } });
`
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${String(title || "AGENT007 app").replace(/</g, "")}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
    },
    {
      path: "src/main.jsx",
      content: `import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(<App />);
`
    },
    {
      path: "src/style.css",
      content: `html, body, #root { margin: 0; min-height: 100%; }
body { font-family: Inter, system-ui, sans-serif; background: #070910; color: #eef2ff; }
`
    },
    {
      path: "README.md",
      content: `# ${title || "AGENT007 app"}

Vite + React app shipped by AGENT007.

\`\`\`bash
npm install
npm run dev
\`\`\`

Fullstack data: \`import { api } from "./agent007"\` then \`api.list("items")\` / \`api.save("items", row)\`.
`
    }
  ];
}

function runtimeClient(slug) {
  return `export const SLUG = ${JSON.stringify(slug)};
const base = typeof window === "undefined" ? "" : "";

async function req(path, opts) {
  const res = await fetch(base + path, {
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  list: (collection) => req("/api/apps/" + SLUG + "/records?collection=" + encodeURIComponent(collection || "items")),
  save: (collection, data) =>
    req("/api/apps/" + SLUG + "/records", {
      method: "POST",
      body: JSON.stringify({ collection: collection || "items", data })
    }),
  remove: (id) => req("/api/apps/" + SLUG + "/records/" + id, { method: "DELETE" })
};
`;
}

function mergeFiles(extracted, slug, title) {
  const map = new Map();
  for (const f of defaults(slug, title)) map.set(f.path, f.content);
  for (const f of extracted) map.set(f.path, f.content);
  map.set("src/agent007.js", runtimeClient(slug));
  if (!map.has("src/App.jsx") && !map.has("src/App.js")) {
    map.set(
      "src/App.jsx",
      `import { useEffect, useState } from "react";
import { api } from "./agent007";

export default function App() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  useEffect(() => { api.list("items").then((d) => setItems(d.records || [])).catch(() => {}); }, []);
  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const row = await api.save("items", { text });
    setItems((x) => [row.record, ...x]);
    setText("");
  }
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
      <h1>${String(title || "AGENT007 app").replace(/</g, "")}</h1>
      <p>Fullstack Vite + React app. Data is saved on the AGENT007 API.</p>
      <form onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item" />
        <button type="submit">Save</button>
      </form>
      <ul>{items.map((it) => <li key={it.id}>{it.data?.text || JSON.stringify(it.data)}</li>)}</ul>
    </main>
  );
}
`
    );
  }
  return [...map.entries()].map(([p, content]) => ({ path: p, content }));
}

async function compileReact(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a7-"));
  try {
    for (const f of files) {
      const dest = path.join(tmp, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
    }
    const entry = fs.existsSync(path.join(tmp, "src/main.jsx"))
      ? path.join(tmp, "src/main.jsx")
      : path.join(tmp, "src/main.js");
    const outfile = path.join(tmp, "dist/app.js");
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await esbuild.build({
      absWorkingDirectory: tmp,
      entryPoints: [entry],
      bundle: true,
      format: "iife",
      outfile,
      jsx: "automatic",
      loader: { ".js": "jsx", ".jsx": "jsx" },
      nodePaths: [path.join(ROOT, "node_modules")],
      define: { "process.env.NODE_ENV": '"production"' },
      minify: true,
      logLevel: "silent"
    });
    const js = fs.readFileSync(outfile, "utf8");
    const cssParts = files.filter((f) => f.path.endsWith(".css")).map((f) => f.content).join("\n");
    return { js, css: cssParts };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function spaShell({ title, slug, css }) {
  const safe = String(title || "AGENT007").replace(/</g, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe}</title>
  <style>${css || ""}</style>
</head>
<body>
  <div id="root"></div>
  <script src="/w/${slug}/app.js"></script>
</body>
</html>`;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipProject(files) {
  const chunks = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.path, "utf8");
    const data = Buffer.from(f.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

module.exports = {
  extractAppFiles,
  mergeFiles,
  compileReact,
  spaShell,
  zipProject,
  runtimeClient
};
