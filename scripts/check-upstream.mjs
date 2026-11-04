import { readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);
const manifest = JSON.parse(
    await readFile(
        new URL("../upstream-manifest.json", import.meta.url),
        "utf8",
    ),
);
try {
    const { stdout } = await exec("git", [
        "ls-remote",
        manifest.repository,
        `refs/heads/${manifest.branch}`,
    ]);
    const current = stdout.trim().split(/\s+/)[0];
    if (current === manifest.commit)
        console.log(`Upstream is unchanged at ${current}.`);
    else {
        console.log(`Upstream changed: ${manifest.commit} -> ${current}`);
        process.exitCode = 1;
    }
} catch (error) {
    console.error("Unable to check upstream:", error.message);
    process.exitCode = 2;
}
