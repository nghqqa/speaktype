// 打包后生成 release/SHA256SUMS.txt：随安装包一起上传到 GitHub Release，
// 应用内更新据此校验下载的安装包完整性（updater 在 release 资产里找同名清单，
// 旧发布没有该资产则跳过校验）。逐行格式与 sha256sum 一致：<hash>␣␣<文件名>。
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "release");
const ARTIFACTS = [
  /^SpeakType-Setup-[\w.]+\.exe$/,
  /^SpeakType-[\w.]+-portable\.exe$/,
  /^SpeakType-[\w.]+-mac-[\w.]+\.(dmg|zip)$/,
];

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });

const files = readdirSync(dir).filter((f) => ARTIFACTS.some((re) => re.test(f))).sort();
if (files.length === 0) {
  console.error("[release-sums] release/ 下没有发布产物；先 npm run pack（或 pack:portable / pack:mac）");
  process.exit(1);
}
const lines = [];
for (const f of files) lines.push(`${await sha256(join(dir, f))}  ${f}`);
const out = join(dir, "SHA256SUMS.txt");
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`[release-sums] ${out}`);
for (const line of lines) console.log(`  ${line}`);
