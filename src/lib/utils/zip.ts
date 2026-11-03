import { inflateRawSync } from "node:zlib";

/**
 * Leitor mínimo de arquivos ZIP (Office Open XML). Suporta entradas
 * "stored" e "deflate". Usado apenas para extrair XML de DOCX/PPTX/XLSX.
 */
export function readZipEntries(buf: Buffer, filter: (name: string) => boolean, maxTotalBytes = 80 * 1024 * 1024): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Localiza o End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo ZIP inválido");
  const entries = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  let total = 0;

  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Diretório ZIP corrompido");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!filter(name)) continue;
    total += uncompSize;
    if (total > maxTotalBytes) throw new Error("Conteúdo descompactado excede o limite permitido");

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: Math.max(uncompSize, 1) * 2 + 1024 }));
  }
  return out;
}
