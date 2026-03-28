import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const docsDir = path.join(rootDir, "docs");
const locales = [
  { dir: "zh-CN", suffix: ".zh-CN.md" },
  { dir: "fr", suffix: ".fr.md" }
];
const localeSuffixes = locales.map((locale) => locale.suffix);

await syncDocsSite();

async function syncDocsSite() {
  for (const locale of locales) {
    const localeDir = path.join(docsDir, locale.dir);
    await fs.rm(localeDir, { recursive: true, force: true });
    await fs.mkdir(localeDir, { recursive: true });
  }

  const rootEntries = await fs.readdir(docsDir, { withFileTypes: true });

  for (const locale of locales) {
    const localeDir = path.join(docsDir, locale.dir);

    for (const entry of rootEntries) {
      if (entry.name === ".vitepress" || locales.some((item) => item.dir === entry.name)) {
        continue;
      }

      const sourcePath = path.join(docsDir, entry.name);
      const targetPath = path.join(localeDir, normalizeTargetName(entry.name, locale.suffix));

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      if (isLocalizedForOtherLocale(entry.name, locale.suffix)) {
        continue;
      }

      const preferredLocalePath = path.join(
        docsDir,
        entry.name.replace(/\.md$/, locale.suffix)
      );
      const localeSourcePath =
        !entry.name.endsWith(locale.suffix) && (await exists(preferredLocalePath))
          ? preferredLocalePath
          : sourcePath;

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = await fs.readFile(localeSourcePath, "utf8");
      await fs.writeFile(targetPath, rewriteLocaleLinks(content, locale.suffix), "utf8");
    }
  }
}

async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    const content = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(targetPath, content, "utf8");
  }
}

function normalizeTargetName(fileName, suffix) {
  return fileName.endsWith(suffix) ? fileName.slice(0, -suffix.length) + ".md" : fileName;
}

function isLocalizedForOtherLocale(fileName, activeSuffix) {
  return localeSuffixes.some((suffix) => suffix !== activeSuffix && fileName.endsWith(suffix));
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function rewriteLocaleLinks(content, suffix) {
  return content.replaceAll(suffix, ".md");
}
