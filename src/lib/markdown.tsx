// Rendu des critiques en markdown léger (S7), assaini strictement.
// Point d'entrée unique réutilisé par toutes les critiques (œuvre, saison, journal).
// Les critiques pourront venir d'autres membres au lot 4 : on n'autorise donc
// jamais le HTML brut, et on restreint les liens à http(s)/mailto.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

const components: Components = {
  // Liens ouverts dans un nouvel onglet, sans fuite de référent.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
};

/** Rend une chaîne markdown assainie. Sûr en Server Component. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
