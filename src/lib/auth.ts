import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username, admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { sendEmail } from "./email";

export const auth = betterAuth({
  appName: "Social Culture Club",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // En cercle privé, la vérification e-mail n'est pas encore bloquante (D24).
    // Passera à `true` avant l'ouverture, avec un provider réel.
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Réinitialisation de votre mot de passe · SCC",
        body: `Bonjour,\n\nPour réinitialiser votre mot de passe, ouvrez ce lien :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Vérifiez votre adresse e-mail · SCC",
        body: `Bienvenue sur Social Culture Club !\n\nConfirmez votre adresse en ouvrant ce lien :\n${url}`,
      });
    },
  },
  // Limitation de débit sur l'authentification (N6).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  plugins: [username(), admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
