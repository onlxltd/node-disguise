import {
    access,
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(root, "upstream-manifest.json");
const ignorePath = path.join(root, ".upstream-sync-ignore");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function isIgnored(file) {
    return manifest.ignored?.some((pattern) => {
        const normalized = pattern.replace(/^\//, "").replace(/\/$/, "");
        return file === normalized || file.startsWith(`${normalized}/`);
    });
}

async function existingFiles(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (!isIgnored(relative))
                files.push(...(await existingFiles(path.join(directory, entry.name), relative)));
        } else if (entry.isFile() && !isIgnored(relative)) {
            files.push(relative);
        }
    }
    return files;
}

const ignoreRules = (await readFile(ignorePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
manifest.ignored = ignoreRules;

let checkout;
try {
    checkout = await mkdtemp(path.join(os.tmpdir(), "node-disguise-upstream-"));
    await exec("git", [
        "clone",
        "--quiet",
        "--depth=1",
        "--branch",
        manifest.branch,
        "--single-branch",
        manifest.repository,
        checkout,
    ]);
    const { stdout: commitOutput } = await exec("git", ["-C", checkout, "rev-parse", "HEAD"]);
    const current = commitOutput.trim();
    if (current === manifest.commit) {
        console.log(`Upstream is unchanged at ${current}.`);
        process.exitCode = 0;
    } else {
        console.log(`Upstream changed: ${manifest.commit ?? "(not recorded)"} -> ${current}`);
        let updated = 0;
        for (const relative of await existingFiles(root)) {
            if (relative === "upstream-manifest.json") continue;
            const upstreamPath = path.join(checkout, relative);
            try {
                await access(upstreamPath);
            } catch {
                continue;
            }
            if (!(await stat(upstreamPath)).isFile()) continue;
            const localPath = path.join(root, relative);
            const [local, upstream] = await Promise.all([
                readFile(localPath),
                readFile(upstreamPath),
            ]);
            if (!local.equals(upstream)) {
                await writeFile(localPath, upstream);
                console.log(`Updated ${relative}`);
                updated++;
            }
        }
        manifest.commit = current;
        delete manifest.ignored;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
        console.log(`Copied upstream changes to ${updated} existing file(s).`);
    }
} catch (error) {
    console.error("Unable to sync upstream:", error.message);
    process.exitCode = 2;
} finally {
    if (checkout) await rm(checkout, { recursive: true, force: true });
}
