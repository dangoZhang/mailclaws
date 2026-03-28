import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const releaseBaseUrl = process.env.MAILCLAW_RELEASE_BASE_URL?.trim() || "";

const compiledRuntimeDir = path.join(rootDir, "dist");
const docsSiteDir = path.join(rootDir, "docs", ".vitepress", "dist");
const outputRoot = path.join(rootDir, "output", "release");
const bundleName = `mailclaw-v${packageJson.version}`;
const stageDir = path.join(outputRoot, bundleName);
const archivePath = path.join(outputRoot, `${bundleName}.tar.gz`);
const npmOutputDir = path.join(outputRoot, "npm");
const homebrewOutputDir = path.join(outputRoot, "homebrew");

assertExists(compiledRuntimeDir, "Run `pnpm build` before packaging a release bundle.");
assertExists(docsSiteDir, "Run `pnpm docs:build` before packaging a release bundle.");

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(archivePath, { force: true });
fs.rmSync(npmOutputDir, { recursive: true, force: true });
fs.rmSync(homebrewOutputDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(npmOutputDir, { recursive: true });
fs.mkdirSync(homebrewOutputDir, { recursive: true });

copyRecursive(compiledRuntimeDir, path.join(stageDir, "dist"));
copyRecursive(docsSiteDir, path.join(stageDir, "docs-site"));

copyIfPresent("README.md");
copyIfPresent("LICENSE");
copyIfPresent(".env.example");
copyIfPresent("pnpm-lock.yaml");

writeJson(path.join(stageDir, "package.json"), buildReleasePackageJson(packageJson));

const npmPackResult = spawnSync("npm", ["pack", "--pack-destination", npmOutputDir], {
  cwd: rootDir,
  stdio: "pipe",
  encoding: "utf8"
});

if (npmPackResult.status !== 0) {
  throw new Error(npmPackResult.stderr || npmPackResult.stdout || "failed to create npm package tarball");
}

const npmTarballName = npmPackResult.stdout
  .trim()
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .at(-1);
if (!npmTarballName) {
  throw new Error("npm pack did not return a tarball name");
}

const npmTarballPath = path.join(npmOutputDir, npmTarballName);

const tarResult = spawnSync("tar", ["-czf", archivePath, "-C", outputRoot, bundleName], {
  cwd: rootDir,
  stdio: "pipe",
  encoding: "utf8"
});

if (tarResult.status !== 0) {
  throw new Error(tarResult.stderr || tarResult.stdout || "failed to create release archive");
}

const archiveSha256 = sha256File(archivePath);
const npmTarballSha256 = sha256File(npmTarballPath);
const homebrewFormulaPath = path.join(homebrewOutputDir, "mailclaw.rb");
const archiveUrl = releaseBaseUrl
  ? `${releaseBaseUrl.replace(/\/$/, "")}/${path.basename(archivePath)}`
  : `file://${archivePath}`;
const checksumsPath = path.join(outputRoot, "checksums.txt");

fs.writeFileSync(
  homebrewFormulaPath,
  buildHomebrewFormula({
    version: packageJson.version,
    archiveUrl,
    archiveSha256
  })
);

fs.writeFileSync(
  checksumsPath,
  [
    `${archiveSha256}  ${path.basename(archivePath)}`,
    `${npmTarballSha256}  ${path.basename(npmTarballPath)}`
  ].join("\n") + "\n"
);

writeJson(path.join(stageDir, "release-manifest.json"), {
  name: packageJson.name,
  version: packageJson.version,
  builtAt: new Date().toISOString(),
  runtimeEntrypoint: "dist/index.js",
  docsEntrypoint: "docs-site/index.html",
  scripts: {
    startServer: "node dist/index.js",
    start: "node dist/index.js",
    mailclaw: "node dist/cli/mailclaw.js",
    mailctl: "node dist/cli/mailctl.js",
    mailioctl: "node dist/cli/mailioctl.js"
  },
  installers: {
    npmTarball: path.relative(rootDir, npmTarballPath),
    npmTarballSha256,
    homebrewFormula: path.relative(rootDir, homebrewFormulaPath),
    releaseArchive: path.relative(rootDir, archivePath),
    releaseArchiveSha256: archiveSha256,
    releaseArchiveUrl: archiveUrl,
    checksums: path.relative(rootDir, checksumsPath)
  }
});

process.stdout.write(
  [
    `release bundle ready: ${path.relative(rootDir, stageDir)}`,
    `release archive ready: ${path.relative(rootDir, archivePath)}`,
    `npm tarball ready: ${path.relative(rootDir, npmTarballPath)}`,
    `homebrew formula ready: ${path.relative(rootDir, homebrewFormulaPath)}`,
    `checksums ready: ${path.relative(rootDir, checksumsPath)}`
  ].join("\n") + "\n"
);

function buildReleasePackageJson(rootPackageJson) {
  return {
    name: rootPackageJson.name,
    version: rootPackageJson.version,
    private: true,
    description: rootPackageJson.description,
    type: rootPackageJson.type,
    packageManager: rootPackageJson.packageManager,
    scripts: {
      start: "node dist/index.js",
      mailclaw: "node dist/cli/mailclaw.js",
      mailctl: "node dist/cli/mailctl.js",
      mailioctl: "node dist/cli/mailioctl.js"
    },
    bin: {
      mailclaw: "./dist/cli/mailclaw.js",
      mailctl: "./dist/cli/mailctl.js",
      mailioctl: "./dist/cli/mailioctl.js"
    },
    dependencies: rootPackageJson.dependencies
  };
}

function copyIfPresent(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const targetPath = path.join(stageDir, path.basename(relativePath));
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function copyRecursive(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function writeJson(targetPath, payload) {
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(targetPath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(targetPath));
  return hash.digest("hex");
}

function assertExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function buildHomebrewFormula(input) {
  return `class Mailclaw < Formula
  desc "Email-native runtime for durable, auditable, multi-agent mail workflows"
  homepage "https://github.com/openclaw/openclaw"
  url "${input.archiveUrl}"
  sha256 "${input.archiveSha256}"
  version "${input.version}"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli/mailclaw.js" => "mailclaw"
    bin.install_symlink libexec/"dist/cli/mailctl.js" => "mailctl"
    bin.install_symlink libexec/"dist/cli/mailioctl.js" => "mailioctl"
  end

  test do
    assert_match "usage: mailctl", shell_output("#{bin}/mailctl --help 2>&1", 0)
  end
end
`;
}
