import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = (process.argv[2] === "production");

const DIST_DIR = path.resolve("dist");
const DIST_MAIN = path.join(DIST_DIR, "main.js");
const FILES_TO_COPY = [
    "manifest.json",
    "openai.json" // 只打包 openai.json
];

const context = await esbuild.context({
    banner: {
        js: banner,
    },
    entryPoints: ["main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtins
    ],
    format: "cjs",
    target: "es2020", // 修改为 es2020 以支持 bigint
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: DIST_MAIN,
    minify: prod,
    define: {
        "process.env.NODE_ENV": prod ? '"production"' : '"development"'
    }
});

// Esbuild context for CSS bundling
const cssContext = await esbuild.context({
    entryPoints: ["styles.css"], // Main CSS file with @import statements
    bundle: true,
    outfile: path.join(DIST_DIR, "styles.css"), // Output bundled CSS to dist
    minify: prod, // Minify CSS in production
    loader: {
        '.css': 'css' // Ensure CSS files are handled as CSS
    },
    logLevel: "info",
});

async function prepareDist() {
    // 1. 备份 data.json（如果存在）
    const dataJsonPath = path.join(DIST_DIR, "data.json");
    let dataJsonBuffer = null;
    if (fssync.existsSync(dataJsonPath)) {
        dataJsonBuffer = await fs.readFile(dataJsonPath);
    }
    // 2. 清空 dist 目录（不包括 data.json）
    if (fssync.existsSync(DIST_DIR)) {
        for (const file of await fs.readdir(DIST_DIR)) {
            if (file !== "data.json") {
                const filePath = path.join(DIST_DIR, file);
                await fs.rm(filePath, { recursive: true, force: true });
            }
        }
    } else {
        await fs.mkdir(DIST_DIR, { recursive: true });
    }
    // 3. 恢复 data.json（如果之前存在）
    if (dataJsonBuffer) {
        await fs.writeFile(dataJsonPath, dataJsonBuffer);
    }
    // 4. 拷贝必要文件
    for (const file of FILES_TO_COPY) {
        if (fssync.existsSync(file)) {
            await fs.copyFile(file, path.join(DIST_DIR, path.basename(file)));
        }
    }
    // Note: styles.css is now handled by the cssContext build step, no longer needs to be copied manually
}

if (prod) {
    await prepareDist();      // 1. 先清空 dist 并创建目录
    await context.rebuild();  // 2. 生成 main.js
    await cssContext.rebuild(); // 3. 生成 bundled styles.css
    await context.dispose();
    await cssContext.dispose();
    process.exit(0);
} else {
    await context.watch();
    await cssContext.watch(); // Watch CSS files in development
}