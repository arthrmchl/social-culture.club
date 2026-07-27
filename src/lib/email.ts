// Transport e-mail de développement : journalise dans la console.
// À remplacer par un provider transactionnel (ex. Resend) avant l'ouverture (N6).

type SendArgs = { to: string; subject: string; body: string };

export async function sendEmail({ to, subject, body }: SendArgs): Promise<void> {
  console.log(
    `\n───────────── E-MAIL (dev) ─────────────\n` +
      `À        : ${to}\n` +
      `Sujet    : ${subject}\n` +
      `${body}\n` +
      `─────────────────────────────────────────\n`,
  );
}
