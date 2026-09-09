/**
 * 从 release 的 SHA256SUMS.txt 文本里取指定文件的 sha256（sha256sum 格式：`<hash>␣␣<文件名>`）。
 * 大写哈希也收（PowerShell Get-FileHash 产出大写），统一转小写与 hashFile 摘要比对。
 * 纯文本解析，供 updater 使用并直接单测。
 */
export function sha256FromSums(text: string, fileName: string): string | undefined {
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m && (m[2] === fileName || m[2]?.endsWith(`/${fileName}`))) return m[1]!.toLowerCase();
  }
  return undefined;
}

/**
 * 解析 GitHub release 资产元数据的 digest 字段（`sha256:<hex>`，上传时自动计算、走 api.github.com
 * 元数据通道）；形式不对（缺省/其他算法）返回 undefined。大写 hex 统一转小写。
 */
export function sha256FromDigest(digest: string | undefined): string | undefined {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(digest ?? "");
  return m?.[1]?.toLowerCase();
}
