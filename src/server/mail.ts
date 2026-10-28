/**
 * Sending e-mail (sign-in codes). Either Resend (RESEND_API_KEY + MAIL_FROM)
 * or any SMTP server, e.g. Gmail with an app password
 * (SMTP_URL=smtps://you%40gmail.com:app-password@smtp.gmail.com:465, MAIL_FROM=…).
 */
import "server-only";

export const mailConfigured = () =>
  !!process.env.MAIL_FROM && (!!process.env.RESEND_API_KEY || !!process.env.SMTP_URL);

export async function sendMail(m: { to: string; subject: string; text: string; html: string }) {
  const from = process.env.MAIL_FROM!;
  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);
    return;
  }
  const { createTransport } = await import("nodemailer");
  await createTransport(process.env.SMTP_URL).sendMail({ from, ...m });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The sign-in code letter in the user's language. */
export function codeMail(code: string, locale: string) {
  const L =
    locale === "ru"
      ? {
          s: "Код для входа в NodiNote",
          h: "Ваш код для входа",
          n: "Код действует 10 минут. Если это были не вы, просто проигнорируйте письмо.",
        }
      : locale === "en"
        ? {
            s: "Your NodiNote sign-in code",
            h: "Your sign-in code",
            n: "The code is valid for 10 minutes. If this wasn’t you, just ignore this e-mail.",
          }
        : {
            s: "NodiNote’ga kiriş kodi",
            h: "Kiriş kodingiz",
            n: "Kod 10 daqiqa amal qiladi. Agar bu siz bölmasangiz, xatni e’tiborsiz qoldiring.",
          };
  return {
    subject: `${L.s}: ${code}`,
    text: `${L.h}: ${code}\n\n${L.n}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
<h2 style="margin:0 0 8px">NodiNote</h2><p style="margin:0 0 16px;color:#555">${esc(L.h)}:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${esc(code)}</p>
<p style="color:#777;font-size:13px">${esc(L.n)}</p></div>`,
  };
}
