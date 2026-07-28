import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le serveur lancé par Playwright compile en même temps qu'un éventuel
  // `npm run dev` local : sans répertoire de build distinct, les deux se
  // disputeraient `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
