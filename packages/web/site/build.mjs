/**
 * Static site generator for the marketing pages.
 *
 * Belegabgleich is a single Svelte app, but the pages *around* it (landing,
 * audience pages, articles, privacy) have no business shipping a JS bundle just
 * to render text — and search engines should see finished HTML. So those pages
 * are generated here as real `.html` files at their final paths, which Vite then
 * picks up as multi-page inputs. The tool itself lives at `/app/` and is the
 * only entry that mounts Svelte.
 *
 * The generated files land in the package directory (they must, for Vite to map
 * them to the right output paths) and are git-ignored. `manifest.json` tracks
 * what the previous run wrote so renamed or deleted pages don't linger.
 */

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { SITE, APP_PATH } from "./site.mjs";
import { renderPage } from "./layout.mjs";
import { buildStaticPages } from "./pages.mjs";
import { buildArticlePages, ARTICLE_INDEX, ARTICLES } from "./articles.mjs";

const here = dirname(fileURLToPath(import.meta.url)); // .../packages/web/site
const webRoot = join(here, ".."); // .../packages/web
const repoRoot = join(webRoot, "..", ".."); // repo root
const MANIFEST = join(here, "manifest.json");

/** "/wissen/" → "wissen/index.html", "/" → "index.html" */
function fileFor(path) {
  const clean = path.replace(/^\/|\/$/g, "");
  return clean ? `${clean}/index.html` : "index.html";
}

/** The tool shell: no marketing chrome, just the Svelte mount point. */
function appPage() {
  return {
    path: APP_PATH,
    kind: "app",
    title: "Belege abgleichen — Belegabgleich",
    description:
      "Kontoauszug und Rechnungsordner laden und sehen, welcher Buchung ein Beleg fehlt. Läuft vollständig im Browser.",
  };
}

function sitemap(pages) {
  const entries = pages
    .filter((p) => p.kind !== "app")
    .map((p) => {
      const article = [...ARTICLE_INDEX.values()].find((a) => a.path === p.path);
      const lastmod = article ? article.updated : undefined;
      // The landing is the entry point, audience pages carry the search intent,
      // articles support them.
      const priority = p.path === "/" ? "1.0" : p.path.startsWith("/wissen/") ? "0.6" : "0.8";
      return `  <url>
    <loc>${SITE.origin}${p.path}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function robots() {
  return `User-agent: *
Allow: /

# The tool itself is an application shell with no indexable content —
# the landing and the audience pages are what should rank.
Disallow: /app/

Sitemap: ${SITE.origin}/sitemap.xml
`;
}

/**
 * Render every page to disk and return the absolute paths, for use as Vite's
 * `build.rollupOptions.input`.
 */
export async function generateSite() {
  const providersDoc = JSON.parse(
    await readFile(join(repoRoot, "providers.json"), "utf8"),
  );
  const providers = providersDoc.providers
    .map((p) => ({ name: p.name, invoiceUrl: p.invoiceUrl || undefined }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  let sha = "";
  try {
    sha = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const version = `${sha || "dev"} – ${new Date().toISOString().slice(0, 10)}`;

  const pages = [
    ...buildStaticPages({ providers, articleIndex: ARTICLE_INDEX }),
    ...buildArticlePages(),
    appPage(),
  ];

  // Remove whatever the previous run wrote but this one doesn't, so a renamed
  // page can't survive as a stale file (and a stale rollup input).
  const written = pages.map((p) => fileFor(p.path));
  if (existsSync(MANIFEST)) {
    const prev = JSON.parse(await readFile(MANIFEST, "utf8"));
    for (const f of prev.files || []) {
      if (!written.includes(f)) await rm(join(webRoot, f), { force: true });
    }
  }

  const inputs = {};
  for (const page of pages) {
    const rel = fileFor(page.path);
    const abs = join(webRoot, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, renderPage(page, { version }), "utf8");
    // Rollup input keys become chunk names; "index" for the landing.
    inputs[rel.replace(/\/index\.html$/, "").replace(/\//g, "-") || "index"] = abs;
  }

  const publicDir = join(webRoot, "public");
  await writeFile(join(publicDir, "sitemap.xml"), sitemap(pages), "utf8");
  await writeFile(join(publicDir, "robots.txt"), robots(), "utf8");

  await writeFile(
    MANIFEST,
    JSON.stringify({ generatedFrom: "site/build.mjs", files: written }, null, 2),
    "utf8",
  );

  return {
    inputs,
    /** Source files that, when edited, mean the site must be regenerated. */
    watch: ["site.mjs", "layout.mjs", "partials.mjs", "pages.mjs", "articles.mjs"].map((f) =>
      join(here, f),
    ),
    /** Route → generated file, for the dev server's directory-index handling. */
    routes: Object.fromEntries(pages.map((p) => [p.path, "/" + fileFor(p.path)])),
    count: pages.length,
    articleCount: ARTICLES.length,
    relativeInputs: Object.values(inputs).map((p) => relative(webRoot, p)),
  };
}
