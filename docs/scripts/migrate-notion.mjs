#!/usr/bin/env node
// Migra o banco "Clone Tabnews" (Notion público) para MDX do Nextra, com i18n.
// Uso (dentro de docs/):
//   node scripts/migrate-notion.mjs                 # tudo
//   node scripts/migrate-notion.mjs --day 14        # um dia (14, 14.1, 14.2...)
//   node scripts/migrate-notion.mjs --day 2 --day 3 # vários dias
//   Saída: content/<locale>/... e public/img/...
//   node scripts/migrate-notion.mjs --refresh       # ignora o cache local
//   node scripts/migrate-notion.mjs --dry           # não escreve arquivos
// Requer Node 18+ (fetch nativo). Sem dependências.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_PAGE_ID = "192cf904-83bd-8094-a4e3-e5a8f6ef9ae8";
const EN_ROOT_PREFIX = "193cf904"; // página "[001] Class notes": filhos dela são EN
const API = "https://jemluz.notion.site/api/v3/";
const UA =
  "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";

const LOCALES = { "PT-br": "pt-BR", "EN-us": "en-US" };
const DEFAULT_LOCALE = "pt-BR";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(here, "..");
const PAGES = join(DOCS, "content");
const IMG_DIR = join(DOCS, "public", "img");
const CACHE = join(here, ".cache");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const REFRESH = args.includes("--refresh");
const DAYS = args.flatMap((a, i) => (a === "--day" ? [args[i + 1]] : []));

const report = { pages: [], unknown: {}, collisions: [], imageFailures: [] };

// ---------- API ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.json();
      if (i === tries - 1) throw new Error(`${path} -> HTTP ${res.status}`);
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await sleep(500 * (i + 1));
  }
}

const unwrap = (rec) => {
  const v = rec?.value;
  return v && v.value ? v.value : v;
};

async function loadPageBlocks(pageId, spaceId) {
  const cacheFile = join(CACHE, `${pageId}.json`);
  if (!REFRESH && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  const blocks = {};
  let cursor = { stack: [] };
  for (let chunk = 0; chunk < 50; chunk++) {
    const d = await api("loadPageChunk", {
      pageId,
      limit: 100,
      cursor,
      chunkNumber: chunk,
      verticalColumns: false,
    });
    for (const [id, rec] of Object.entries(d.recordMap?.block ?? {})) {
      const v = unwrap(rec);
      if (v) blocks[id] = v;
    }
    cursor = d.cursor;
    if (!cursor?.stack?.length) break;
  }
  // Filhos da subárvore da página que o loadPageChunk não devolveu
  const subtree = () => {
    const seen = new Set();
    const missing = new Set();
    const walk = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const b = blocks[id];
      if (!b) return void missing.add(id);
      for (const c of b.content ?? []) walk(c);
    };
    walk(pageId);
    return { seen, missing };
  };
  for (let round = 0; round < 10; round++) {
    const { missing } = subtree();
    if (!missing.size) break;
    const ids = [...missing];
    let got = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const d = await api("getRecordValues", {
        requests: ids.slice(i, i + 20).map((id) => ({ table: "block", id })),
      }).catch(() => null);
      for (const r of d?.results ?? []) {
        if (r?.value?.id) {
          blocks[r.value.id] = r.value;
          got++;
        }
      }
    }
    if (!got) break;
  }
  const { seen } = subtree();
  for (const id of Object.keys(blocks)) if (!seen.has(id)) delete blocks[id];
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(blocks));
  return blocks;
}

async function listPages() {
  const root = await api("loadPageChunk", {
    pageId: ROOT_PAGE_ID,
    limit: 1,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  });
  const rootRec = root.recordMap.block[ROOT_PAGE_ID];
  const rootBlock = unwrap(rootRec);
  const spaceId = rootRec.spaceId ?? rootBlock.space_id;
  const collection = { id: rootBlock.collection_id, spaceId };
  const view = { id: rootBlock.view_ids[0], spaceId };
  const d = await api("queryCollection", {
    collection,
    collectionView: view,
    loader: {
      type: "reducer",
      reducers: { c: { type: "results", limit: 500 } },
      searchQuery: "",
      userTimeZone: "America/Sao_Paulo",
    },
  });
  const schema = unwrap(Object.values(d.recordMap.collection)[0]).schema;
  const col = (name) =>
    Object.entries(schema).find(([, s]) => s.name === name)?.[0];
  const keys = {
    order: col("order"),
    lang: col("Idioma"),
    fav: col("Favorito"),
    date: col("Data"),
  };
  const text = (p) => (p ? p.map((s) => s[0]).join("") : "");
  return d.result.reducerResults.c.blockIds.map((id) => {
    const b = unwrap(d.recordMap.block[id]);
    const p = b.properties ?? {};
    const langRaw = text(p[keys.lang]);
    const underEn = (b.parent_id ?? "").startsWith(EN_ROOT_PREFIX);
    const dateProp = p[keys.date]?.[0]?.[1]?.find((a) => a[0] === "d")?.[1];
    return {
      id,
      spaceId,
      title: plain(p.title),
      order: text(p[keys.order]).trim(),
      locale: underEn ? "en-US" : (LOCALES[langRaw] ?? DEFAULT_LOCALE),
      favorite: text(p[keys.fav]) === "Yes",
      date: dateProp?.start_date ?? null,
    };
  });
}

// ---------- rich text -> markdown ----------
function plain(rt) {
  return (rt ?? []).map((s) => s[0]).join("");
}

function escapeText(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/([*_`{}\[<])/g, "\\$1")
    .replace(/>/g, "&gt;");
}

function wrap(text, marker) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return text;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function inline(rt, noBold = false) {
  if (!rt) return "";
  return rt
    .map(([raw, anns = []]) => {
      const has = (k) => anns.find((a) => a[0] === k);
      if (raw === "‣") {
        const lm = has("lm")?.[1];
        if (lm?.href) return `[${escapeText(lm.title || lm.href)}](${lm.href})`;
        const d = has("d")?.[1];
        return d?.start_date ?? ""; // menções de data; usuários/páginas são ignorados
      }
      if (has("c")) {
        const fence = raw.includes("`") ? "``" : "`";
        let out = `${fence}${raw}${fence}`;
        const link = has("a");
        return link ? `[${out}](${link[1]})` : out;
      }
      let out = escapeText(raw);
      if (has("s")) out = wrap(out, "~~");
      if (has("i")) out = wrap(out, "*");
      if (has("b") && !noBold) out = wrap(out, "**");
      const link = has("a");
      if (link) out = `[${out}](${link[1]})`;
      return out;
    })
    .join("");
}

function escapeLineStart(s) {
  return s.replace(/^(\s*)(#{1,6}\s|[-+]\s|\d+[.)]\s|&gt;)/, "$1\\$2");
}

// ---------- imagens (não baixa: gera caminho previsto + manifesto) ----------
const imageManifest = [];

function planImage(block, ctx) {
  const src = block.properties?.source?.[0]?.[0] ?? "";
  const nameExt = src.split(".").pop()?.toLowerCase();
  const ext = /^(png|jpe?g|gif|webp|svg|avif)$/.test(nameExt) ? nameExt : "png";
  ctx.imgCount = (ctx.imgCount ?? 0) + 1;
  const file = `${String(ctx.imgCount).padStart(2, "0")}.${ext}`;
  const publicPath = `/img/${ctx.imgDir}/${file}`;
  imageManifest.push({
    page: ctx.slug,
    locale: ctx.locale,
    file: `public/img/${ctx.imgDir}/${file}`,
    block: block.id,
    caption: plain(block.properties?.caption),
  });
  return publicPath;
}

// ---------- blocos -> MDX ----------
const indent = (s, n) =>
  s
    .split("\n")
    .map((l) => (l ? " ".repeat(n) + l : l))
    .join("\n");

async function children(block, blocks, ctx, depth) {
  const out = [];
  let numbered = 0;
  for (const id of block.content ?? []) {
    const b = blocks[id];
    if (!b || b.alive === false) continue;
    numbered = b.type === "numbered_list" ? numbered + 1 : 0;
    const md = await render(b, blocks, ctx, depth, numbered);
    if (md !== null && md !== undefined && md.trim() !== "")
      out.push({ md, type: b.type });
  }
  return out;
}

function join_(items) {
  let s = "";
  items.forEach((it, i) => {
    if (i === 0) s = it.md;
    else {
      const tight =
        /_list$|^to_do$/.test(it.type) &&
        /_list$|^to_do$/.test(items[i - 1].type);
      s += (tight ? "\n" : "\n\n") + it.md;
    }
  });
  return s;
}

async function render(b, blocks, ctx, depth, n) {
  const t = b.type;
  const rt = b.properties?.title;
  const kids = async () => join_(await children(b, blocks, ctx, depth + 1));
  switch (t) {
    case "text": {
      const own = escapeLineStart(inline(rt)).trim();
      const rest = b.content?.length ? await kids() : "";
      return [own, rest].filter(Boolean).join("\n\n");
    }
    case "header":
      return `## ${inline(rt, true).trim()}`;
    case "sub_header":
      return `### ${inline(rt, true).trim()}`;
    case "sub_sub_header":
      return `#### ${inline(rt, true).trim()}`;
    case "bulleted_list":
    case "numbered_list":
    case "to_do": {
      const mark =
        t === "numbered_list"
          ? `${n}.`
          : t === "to_do"
            ? `- [${b.properties?.checked?.[0]?.[0] === "Yes" ? "x" : " "}]`
            : "-";
      const head = `${mark} ${inline(rt).trim()}`;
      if (!b.content?.length) return head;
      const sub = await kids();
      return `${head}\n${indent(sub, mark.length + 1)}`;
    }
    case "quote":
      return inline(rt)
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "callout": {
      ctx.usesCallout = true;
      const emoji = b.format?.page_icon ?? "💡";
      const body = [inline(rt).trim(), b.content?.length ? await kids() : ""]
        .filter(Boolean)
        .join("\n\n");
      return `<Callout emoji="${emoji}">\n${body}\n</Callout>`;
    }
    case "toggle": {
      const body = b.content?.length ? await kids() : "";
      return `<details>\n<summary>${inline(rt).trim()}</summary>\n\n${body}\n\n</details>`;
    }
    case "divider":
      return "---";
    case "code": {
      const lang = (b.properties?.language?.[0]?.[0] ?? "").toLowerCase();
      const map = { "plain text": "", shell: "bash", "c++": "cpp" };
      const code = plain(rt);
      const fence = code.includes("```") ? "````" : "```";
      return `${fence}${map[lang] ?? lang}\n${code}\n${fence}`;
    }
    case "image": {
      const path = planImage(b, ctx);
      if (!path) return null;
      const alt = plain(b.properties?.caption).replace(/[\[\]]/g, "");
      return `![${alt}](${path})`;
    }
    case "column_list":
    case "column":
    case "transclusion_container":
      return join_(await children(b, blocks, ctx, depth));
    case "table": {
      const order = b.format?.table_block_column_order ?? [];
      const rows = (b.content ?? []).map((id) => blocks[id]).filter(Boolean);
      const cell = (r, c) =>
        inline(r.properties?.[c]).replace(/\|/g, "\\|").replace(/\n/g, " ");
      const line = (r) => `| ${order.map((c) => cell(r, c)).join(" | ")} |`;
      const hasHeader = b.format?.table_block_column_header;
      const head = hasHeader
        ? line(rows[0])
        : `| ${order.map(() => " ").join(" | ")} |`;
      const body = (hasHeader ? rows.slice(1) : rows).map(line);
      return [head, `| ${order.map(() => "---").join(" | ")} |`, ...body].join(
        "\n",
      );
    }
    case "bookmark":
    case "embed":
    case "video":
    case "file":
    case "pdf":
    case "external_object_instance": {
      const url =
        b.properties?.link?.[0]?.[0] ??
        b.properties?.source?.[0]?.[0] ??
        b.format?.original_url ??
        "";
      if (!url) break;
      return `[${plain(b.properties?.title) || url}](${url})`;
    }
    case "page":
    case "collection_view_page":
      return null;
    case "button":
      return null;
    default:
      break;
  }
  report.unknown[t] = (report.unknown[t] ?? 0) + 1;
  return `{/* TODO(migração): bloco "${t}" não convertido */}`;
}

// ---------- arquivos ----------
const cleanTitle = (t) =>
  t
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function target(page) {
  const [dayRaw] = page.order.split(".");
  const day = Number.parseInt(dayRaw, 10);
  const sub = page.order.includes(".") ? page.order.split(".")[1] : null;
  if (!Number.isNaN(day) && day === 0) return { dir: "", file: "index" };
  if (!Number.isNaN(day) && day === 1 && !sub)
    return { dir: "", file: "resumo" };
  if (Number.isNaN(day))
    return { dir: "", file: slugify(cleanTitle(page.title)) };
  const dir = `dia-${String(day).padStart(2, "0")}`;
  return { dir, file: sub ? `${day}-${sub}` : "index" };
}

const yaml = (v) => JSON.stringify(v);

async function convertPage(page) {
  const { dir, file } = target(page);
  const blocks = await loadPageBlocks(page.id, page.spaceId);
  const root = blocks[page.id];
  const ctx = {
    spaceId: page.spaceId,
    slug: `${dir}/${file}`,
    imgDir: dir ? `${dir}/${file}` : file,
    usesCallout: false,
    locale: page.locale,
  };
  const title = cleanTitle(page.title);
  const body = join_(await children(root, blocks, ctx, 0));
  const fm = [
    "---",
    `title: ${yaml(title)}`,
    `order: ${yaml(page.order)}`,
    `lang: ${page.locale}`,
    `translationStatus: ${page.locale === DEFAULT_LOCALE ? "original" : "manual"}`,
    page.date ? `date: ${page.date}` : null,
    page.favorite ? "favorite: true" : null,
    `notionId: ${page.id}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  const imports = ctx.usesCallout
    ? `import { Callout } from "nextra/components";\n\n`
    : "";
  const mdx = `${fm}\n\n${imports}# ${escapeText(title)}\n\n${body}\n`.replace(
    /\n{3,}/g,
    "\n\n",
  );
  const out = join(PAGES, page.locale, dir, `${file}.mdx`);
  if (!DRY) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, mdx);
  }
  report.pages.push({
    order: page.order,
    locale: page.locale,
    file: `${dir}/${file}`,
    title,
  });
}

// ---------- _meta por idioma, gerado a partir do que existe em disco ----------
function readFm(path) {
  const m = readFileSync(path, "utf8").match(/^---\n([\s\S]*?)\n---/);
  const get = (k) => m?.[1].match(new RegExp(`^${k}: (.*)$`, "m"))?.[1];
  const parse = (v) => (v?.startsWith('"') ? JSON.parse(v) : v);
  return { title: parse(get("title")), order: parse(get("order")) };
}

function writeMetas() {
  for (const loc of Object.values(LOCALES)) {
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      const items = [];
      const entries = readdirSync(dir);
      for (const e of entries) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
          if (/^dia-\d+$/.test(e)) {
            const n = Number.parseInt(e.slice(4), 10);
            items.push({
              key: e,
              order: n,
              title: `${loc === "en-US" ? "Day" : "Dia"} ${n}`,
            });
            walk(p);
          }
        } else if (e.endsWith(".mdx")) {
          const { title, order } = readFm(p);
          const key = e.replace(".mdx", "");
          const num = Number.parseFloat(order ?? "999");
          const label =
            key === "index" || key === "resumo" ? title : `${order} · ${title}`;
          items.push({ key, order: key === "index" ? -1 : num, title: label });
        }
      }
      if (!items.length) return;
      items.sort((a, b) => a.order - b.order);
      const body = items
        .map((i) => `  ${JSON.stringify(i.key)}: ${JSON.stringify(i.title)},`)
        .join("\n");
      if (!DRY)
        writeFileSync(join(dir, "_meta.js"), `export default {\n${body}\n};\n`);
    };
    walk(join(PAGES, loc));
  }
}

// ---------- main ----------
const all = await listPages();
console.log(`Notion: ${all.length} páginas`);

const wanted = all.filter(
  (p) =>
    !DAYS.length ||
    DAYS.some((d) => p.order === d || p.order.split(".")[0] === d),
);

const seen = new Map();
for (const p of wanted.sort(
  (a, b) => parseFloat(a.order) - parseFloat(b.order),
)) {
  const key = `${p.order}|${p.locale}`;
  if (seen.has(key)) {
    report.collisions.push({
      key,
      kept: seen.get(key).title,
      skipped: p.title,
      skippedId: p.id,
    });
    continue;
  }
  seen.set(key, p);
}

for (const p of seen.values()) {
  process.stdout.write(
    `  [${p.locale}] ${p.order.padEnd(5)} ${cleanTitle(p.title)} ... `,
  );
  try {
    await convertPage(p);
    console.log("ok");
  } catch (e) {
    console.log(`ERRO: ${e.message}`);
    report.unknown[`ERRO:${p.id}`] = e.message;
  }
}

writeMetas();

// matriz de cobertura (considera todo o banco, não só o filtro)
const cov = new Map();
for (const p of all) {
  const day = p.order;
  cov.set(day, { ...(cov.get(day) ?? {}), [p.locale]: true });
}
const rows = [...cov.entries()]
  .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
  .map(
    ([o, l]) =>
      `| ${o} | ${l["pt-BR"] ? "✅" : "❌"} | ${l["en-US"] ? "✅" : "❌"} |`,
  );
const manifestMd = [
  "# Imagens a baixar manualmente",
  "",
  "Salve cada imagem do Notion em `docs/<arquivo>`. A ordem (01, 02...) é a ordem em que aparecem na página.",
  "",
  ...[...new Set(imageManifest.map((i) => `${i.locale}|${i.page}`))].flatMap(
    (k) => {
      const [loc, page] = k.split("|");
      const imgs = imageManifest.filter(
        (i) => i.locale === loc && i.page === page,
      );
      return [
        `## [${loc}] ${page} (${imgs.length})`,
        "",
        ...imgs.map((i) => `- [ ] \`${i.file}\``),
        "",
      ];
    },
  ),
].join("\n");
if (!DRY) writeFileSync(join(here, "images-manifest.md"), manifestMd);

const md = [
  "# Relatório de migração",
  "",
  `Gerado em ${new Date().toISOString()}`,
  "",
  `- Páginas convertidas nesta execução: ${report.pages.length}`,
  `- Blocos desconhecidos: ${JSON.stringify(report.unknown)}`,
  `- Colisões (mesmo order+idioma): ${JSON.stringify(report.collisions)}`,
  `- Imagens a baixar: ${imageManifest.length} (ver images-manifest.md)`,
  "",
  "## Cobertura de tradução no Notion",
  "",
  "| order | pt-BR | en-US |",
  "|---|---|---|",
  ...rows,
  "",
].join("\n");
if (!DRY) writeFileSync(join(here, "migration-report.md"), md);
console.log(
  `\nColisões: ${report.collisions.length} | Imagens a baixar: ${imageManifest.length}`,
);
console.log("Desconhecidos:", report.unknown);
