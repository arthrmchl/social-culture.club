import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "./db";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");

const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo en entrée

/**
 * Redimensionne et enregistre un visuel sur le disque, puis crée l'entrée Image.
 * Les visuels sont servis via /api/uploads/[id].
 */
export async function saveImageFromBuffer(
  input: Buffer,
  uploadedById: string | null,
  opts: { maxWidth?: number } = {},
): Promise<{ id: string; path: string; width: number; height: number }> {
  if (input.byteLength > MAX_BYTES) {
    throw new Error("Image trop volumineuse (8 Mo max).");
  }

  const maxWidth = opts.maxWidth ?? 800;
  const pipeline = sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 82 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  const image = await db.image.create({
    data: {
      // chemin déterminé après la création pour utiliser l'id comme nom de fichier
      path: "",
      width: info.width,
      height: info.height,
      uploadedById: uploadedById ?? undefined,
    },
  });

  const relPath = path.join("covers", `${image.id}.webp`);
  const absPath = path.join(UPLOADS_DIR, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, data);

  await db.image.update({ where: { id: image.id }, data: { path: relPath } });

  return { id: image.id, path: relPath, width: info.width, height: info.height };
}

/** Lit un visuel depuis le disque à partir de son id. */
export async function readImage(
  id: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const image = await db.image.findUnique({ where: { id } });
  if (!image || !image.path) return null;

  const absPath = path.join(UPLOADS_DIR, image.path);
  // Empêche toute traversée de répertoire.
  if (!absPath.startsWith(UPLOADS_DIR + path.sep)) return null;

  try {
    const body = await fs.readFile(absPath);
    return { body, contentType: "image/webp" };
  } catch {
    return null;
  }
}
