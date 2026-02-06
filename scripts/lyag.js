#!/usr/bin/env node
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const scriptDir = __dirname;
const rootDir = path.resolve(scriptDir, "..");
const depsFile = path.join(rootDir, "deps.yml");
const rulesDir = path.join(rootDir, "rules");
const startDir = process.cwd();
const helpFile = path.join(rootDir, "assets", "help.txt");
const usageText = fs.readFileSync(helpFile, "utf8");

function printUsage(usage = usageText) {
    process.stdout.write(usage);
}

function expandHome(inputPath) {
    if (!inputPath) {
        return inputPath;
    }
    if (inputPath === "~") {
        return process.env.HOME || inputPath;
    }
    if (inputPath.startsWith("~/")) {
        return path.join(process.env.HOME || "~", inputPath.slice(2));
    }
    return inputPath;
}

async function resolveProjectPath(projectPath, startPath) {
    let resolved = expandHome(projectPath);
    if (!path.isAbsolute(resolved)) {
        resolved = path.join(startPath, resolved);
    }
    try {
        const real = await fsp.realpath(resolved);
        return real;
    } catch (error) {
        return null;
    }
}

async function ensureReadableDir(dirPath) {
    try {
        const stats = await fsp.stat(dirPath);
        if (!stats.isDirectory()) {
            return "not-dir";
        }
        await fsp.access(dirPath, fs.constants.R_OK);
        return "ok";
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return "missing";
        }
        if (error && error.code === "EACCES") {
            return "no-read";
        }
        return "missing";
    }
}

async function ensureOutputDir(outputRoot, startPath) {
    let resolved = expandHome(outputRoot);
    if (!path.isAbsolute(resolved)) {
        resolved = path.join(startPath, resolved);
    }
    try {
        await fsp.mkdir(resolved, { recursive: true });
    } catch (error) {
        return { ok: false, path: null, message: "Unable to create output path." };
    }
    try {
        const real = await fsp.realpath(resolved);
        return { ok: true, path: real, message: null };
    } catch (error) {
        return { ok: false, path: null, message: "Output path doesn't exist." };
    }
}

async function parseDepsYaml(filePath) {
    const content = await fsp.readFile(filePath, "utf8");
    const extMap = new Map();
    const depsMap = new Map();

    let currentLang = "";
    let section = "";
    const lines = content.split(/\n/);

    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (/^[A-Za-z0-9-]+:/.test(line)) {
            currentLang = line.replace(/:.*/, "");
            section = "";
            continue;
        }
        if (/^[\s]{4}ext:/.test(line)) {
            section = "ext";
            continue;
        }
        if (/^[\s]{4}deps:/.test(line)) {
            section = "deps";
            continue;
        }
        if (section === "ext" && /^[\s]{8}-[\s]/.test(line)) {
            const ext = line.replace(/^[\s]{8}-[\s]/, "").trim();
            if (!ext) {
                continue;
            }
            const key = ext.toLowerCase();
            if (!extMap.has(key)) {
                extMap.set(key, new Set());
            }
            extMap.get(key).add(currentLang);
            continue;
        }
        if (section === "deps" && /^[\s]{8}[A-Za-z0-9-]+:/.test(line)) {
            const dep = line.replace(/^[\s]{8}/, "").replace(/:.*/, "").trim();
            if (!dep) {
                continue;
            }
            if (!depsMap.has(currentLang)) {
                depsMap.set(currentLang, new Set());
            }
            depsMap.get(currentLang).add(dep);
        }
    }

    return { extMap, depsMap };
}

async function collectFileExtensions(projectPath) {
    const extensions = new Set();

    async function walk(dirPath) {
        let entries;
        try {
            entries = await fsp.readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                await walk(entryPath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const base = entry.name;
            if (!base.includes(".")) {
                continue;
            }
            const parts = base.split(".");
            const ext = parts[parts.length - 1];
            if (!ext) {
                continue;
            }
            extensions.add(ext.toLowerCase());
        }
    }

    await walk(projectPath);
    return extensions;
}

function computeSelectedLangs(exts, extMap, depsMap) {
    const selected = new Set();
    const queue = [];

    for (const ext of exts) {
        const langs = extMap.get(ext);
        if (!langs) {
            continue;
        }
        for (const lang of langs) {
            if (!selected.has(lang)) {
                selected.add(lang);
                queue.push(lang);
            }
        }
    }

    while (queue.length > 0) {
        const lang = queue.shift();
        const deps = depsMap.get(lang);
        if (!deps) {
            continue;
        }
        for (const dep of deps) {
            if (!selected.has(dep)) {
                selected.add(dep);
                queue.push(dep);
            }
        }
    }

    return Array.from(selected).sort();
}

async function collectRuleFilenames(langs) {
    const filenames = new Set();
    for (const lang of langs) {
        const srcDir = path.join(rulesDir, lang);
        try {
            const entries = await fsp.readdir(srcDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile()) {
                    filenames.add(entry.name);
                }
            }
        } catch (error) {
            continue;
        }
    }
    return Array.from(filenames).sort();
}

async function concatenateRules(outputDir, langs, filenames) {
    for (const filename of filenames) {
        if (!filename) {
            continue;
        }
        const outFile = path.join(outputDir, filename);
        await fsp.writeFile(outFile, "");
        for (const lang of langs) {
            if (!lang) {
                continue;
            }
            const ruleFile = path.join(rulesDir, lang, filename);
            try {
                await fsp.access(ruleFile, fs.constants.R_OK);
            } catch (error) {
                continue;
            }
            const content = await fsp.readFile(ruleFile, "utf8");
            await fsp.appendFile(outFile, content + "\n\n");
        }
    }
}

async function runMainOperations(projectPath = ".", outputRoot = "") {
    let resolvedProject = await resolveProjectPath(projectPath, startDir);
    if (!resolvedProject) {
        process.stdout.write("Project doesn't exist.\n");
        process.exit(1);
    }

    const projectStatus = await ensureReadableDir(resolvedProject);
    if (projectStatus === "missing" || projectStatus === "not-dir") {
        process.stdout.write("Project doesn't exist.\n");
        process.exit(1);
    }
    if (projectStatus === "no-read") {
        process.stdout.write("No read permission for project folder.\n");
        process.exit(1);
    }

    const { extMap, depsMap } = await parseDepsYaml(depsFile);
    const exts = await collectFileExtensions(resolvedProject);
    const selectedLangs = computeSelectedLangs(exts, extMap, depsMap);

    if (selectedLangs.length === 0) {
        process.stdout.write(`No matching file types found in ${resolvedProject}.\n`);
        process.exit(0);
    }

    let outputDir = resolvedProject;
    if (outputRoot) {
        const outputResult = await ensureOutputDir(outputRoot, startDir);
        if (!outputResult.ok) {
            process.stdout.write(`${outputResult.message}\n`);
            process.exit(1);
        }
        outputDir = outputResult.path;
    }

    await fsp.mkdir(outputDir, { recursive: true });

    const filenames = await collectRuleFilenames(selectedLangs);
    await concatenateRules(outputDir, selectedLangs, filenames);

    process.stdout.write(`Generated rule bundles in ${outputDir}\n`);
}

function parseCli(argv = process.argv.slice(2)) {
    if (!argv || argv.length === 0) {
        printUsage();
        process.exit(0);
    }

    const args = [...argv];
    const command = args[0];

    if (command === "-h" || command === "--help") {
        printUsage();
        process.exit(0);
    }

    if (command !== "gen") {
        process.stdout.write(`Unknown command: ${command}\n`);
        printUsage();
        process.exit(1);
    }

    args.shift();
    let projectPath = ".";
    let outputRoot = "";

    while (args.length > 0) {
        const option = args.shift();
        if (option === "-s" || option === "--source") {
            projectPath = args.shift() || "";
            continue;
        }
        if (option === "-o" || option === "--output") {
            outputRoot = args.shift() || "";
            continue;
        }
        if (option === "-h" || option === "--help") {
            printUsage();
            process.exit(0);
        }
        process.stdout.write(`Unknown option: ${option}\n`);
        printUsage();
        process.exit(1);
    }

    return { projectPath, outputRoot };
}

async function main() {
    if (!fs.existsSync(depsFile)) {
        process.stdout.write(`deps.yml not found at ${depsFile}\n`);
        process.exit(1);
    }

    if (!fs.existsSync(rulesDir)) {
        process.stdout.write(`rules folder not found at ${rulesDir}\n`);
        process.exit(1);
    }

    const { projectPath, outputRoot } = parseCli();
    await runMainOperations(projectPath, outputRoot);
}

if (require.main === module) {
    main().catch((error) => {
        const message = error && error.message ? error.message : String(error);
        process.stdout.write(message + "\n");
        process.exit(1);
    });
}

module.exports = {
    printUsage,
    runMainOperations,
    parseCli,
    usageText,
};
