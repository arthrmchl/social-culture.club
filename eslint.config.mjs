import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client Prisma généré.
    "src/generated/**",
  ]),
  {
    rules: {
      // L'interface est en français : les apostrophes typographiques dans le
      // JSX sont volontaires et lisibles telles quelles.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Les pages publiques (lot 4) affichent le contenu **d'autrui** à un
    // visiteur éventuellement déconnecté. Toute la logique « qui peut voir
    // quoi » (D25, D26) vit dans src/lib/social/ ; une page qui interrogerait
    // la base directement la contournerait sans que rien ne le signale.
    //
    // Cette règle est le seul garde-fou mécanique du lot : les trois autres
    // (renvoyer null plutôt qu'un objet partiel, notFound() plutôt que 403, la
    // section verifySocial) sont des conventions.
    files: ["src/app/(public)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Une page publique ne lit jamais la base directement : passer par src/lib/social/read.ts, qui porte les règles de visibilité (D25, D26).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
