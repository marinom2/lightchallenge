// webapp/scripts/detect-stack.mjs
import { promises as fs } from "fs";
import path from "path";

const WEBAPP = process.cwd();

const fileExists = async (p) => !!(await fs.stat(p).catch(() => null));
const hasAny = async (paths) => (await Promise.all(paths.map(fileExists))).some(Boolean);

const globLike = async (dir, exts = []) => {
  const out = [];
  const walk = async (d) => {
    const ents = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (exts.length === 0 || exts.some((x) => p.endsWith(x))) out.push(p);
    }
  };
  await walk(dir);
  return out;
};

const readText = (p) => fs.readFile(p, "utf8").catch(() => "");

const detect = async () => {
  const files = await globLike(WEBAPP, [".js", ".ts", ".tsx", ".jsx", ".json", ".css"]);
  const texts = await Promise.all(files.map(readText));

  const hasNextConfig = await hasAny([
    path.join(WEBAPP, "next.config.js"),
    path.join(WEBAPP, "next.config.mjs"),
  ]);
  const hasAppDir = await fileExists(path.join(WEBAPP, "app"));
  const hasPagesDir = await fileExists(path.join(WEBAPP, "pages"));
  const usesNextImport = texts.some((t) => t.includes("next/") || t.includes(" from \"next"));
  const isNext = hasNextConfig || hasAppDir || hasPagesDir || usesNextImport;

  const isTS =
    (await fileExists(path.join(WEBAPP, "tsconfig.json"))) ||
    files.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const tailwind =
    (await hasAny([
      path.join(WEBAPP, "tailwind.config.js"),
      path.join(WEBAPP, "tailwind.config.cjs"),
      path.join(WEBAPP, "tailwind.config.mjs"),
    ])) ||
    texts.some((t) => t.includes("@tailwind base") || t.includes("tailwindcss"));

  const usesViem = texts.some((t) => t.includes(" from \"viem") || t.includes(" from 'viem'"));
  const usesWagmi = texts.some((t) => t.includes(" from \"wagmi") || t.includes(" from 'wagmi'"));

  const usesESLint =
    (await hasAny([path.join(WEBAPP, ".eslintrc"), path.join(WEBAPP, ".eslintrc.json"), path.join(WEBAPP, ".eslintrc.js")])) ||
    texts.some((t) => t.includes("eslint"));

  const deps = {};
  const devDeps = {};
  const scripts = {};

  if (isNext) {
    deps["next"] = "14.x";
    deps["react"] = "18.x";
    deps["react-dom"] = "18.x";
    scripts["dev"] = "next dev -p 3000";
    scripts["build"] = "next build";
    scripts["start"] = "next start -p 3000";
    scripts["lint"] = "next lint";
  }

  if (usesViem) deps["viem"] = "2.x";
  if (usesWagmi) deps["wagmi"] = "2.x";

  if (isTS) {
    devDeps["typescript"] = "^5.4.0";
    devDeps["@types/node"] = "^20.0.0";
    devDeps["@types/react"] = "^18.2.0";
    scripts["typecheck"] = "tsc --noEmit";
  }

  if (tailwind) {
    devDeps["tailwindcss"] = "^3.4.0";
    devDeps["postcss"] = "^8.4.0";
    devDeps["autoprefixer"] = "^10.4.0";
  }

  if (usesESLint && isNext) {
    devDeps["eslint"] = "^8.57.0";
    devDeps["eslint-config-next"] = "14.x";
  }

  // Always safe:
  scripts["postinstall"] = "node ./scripts/sync-abis.mjs || true";

  const pkg = {
    name: "webapp",
    private: true,
    version: "0.1.0",
    scripts,
    dependencies: deps,
    devDependencies: devDeps,
  };

  console.log(JSON.stringify(pkg, null, 2));
};

detect();