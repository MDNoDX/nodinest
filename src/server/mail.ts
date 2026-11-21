/**
 * Sending e-mail (sign-up and password reset codes). In development
 * NN_MAIL_LOG=1 prints the letter to the server log instead of sending it. Either Resend (RESEND_API_KEY + MAIL_FROM)
 * or any SMTP server, e.g. Gmail with an app password
 * (SMTP_URL=smtps://you%40gmail.com:app-password@smtp.gmail.com:465, MAIL_FROM=…).
 */
import "server-only";

export const mailConfigured = () =>
  !!process.env.MAIL_FROM && (!!process.env.RESEND_API_KEY || !!process.env.SMTP_URL);

export async function sendMail(m: { to: string; subject: string; text: string; html: string }) {
  const from = process.env.MAIL_FROM!;
  if (process.env.NN_MAIL_LOG === "1" && process.env.NODE_ENV !== "production") {
    console.log(`[nodinest] mail to ${m.to}: ${m.subject}\n${m.text}`);
    return;
  }
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

const RESET = {
  ru: { s: "Сброс пароля Röznoma", h: "Код для сброса пароля" },
  en: { s: "Reset your Röznoma password", h: "Your password reset code" },
  uz: { s: "Röznoma parolini tiklaş", h: "Parolni tiklaş kodi" },
};

const LINK = {
  uz: "Yoki şu tugmani bosing:",
  ru: "Или нажмите кнопку:",
  en: "Or tap the button:",
};
const BUTTON = {
  uz: { "sign-in": "Hisob oçiş", reset: "Yangi parol qöyiş" },
  ru: { "sign-in": "Создать аккаунт", reset: "Задать новый пароль" },
  en: { "sign-in": "Create my account", reset: "Set a new password" },
};

/**
 * The sign-in (or password reset) code letter in the user's language. With
 * `link` it also carries a button that opens the form with the code already
 * filled in (the same one-time code, so the link lives 10 minutes too).
 */
export function codeMail(
  code: string,
  locale: string,
  purpose: "sign-in" | "reset" = "sign-in",
  link?: string,
) {
  const base =
    locale === "ru"
      ? {
          s: "Код для входа в Röznoma",
          h: "Ваш код для входа",
          n: "Код действует 10 минут. Если это были не вы, просто проигнорируйте письмо.",
        }
      : locale === "en"
        ? {
            s: "Your Röznoma sign-in code",
            h: "Your sign-in code",
            n: "The code is valid for 10 minutes. If this wasn’t you, just ignore this e-mail.",
          }
        : {
            s: "Röznoma’ga kiriş kodi",
            h: "Kiriş kodingiz",
            n: "Kod 10 daqiqa amal qiladi. Agar bu siz bölmasangiz, xatni e’tiborsiz qoldiring.",
          };
  const reset = locale === "ru" ? RESET.ru : locale === "en" ? RESET.en : RESET.uz;
  const L = purpose === "reset" ? { ...base, ...reset } : base;
  const lang = locale === "ru" ? "ru" : locale === "en" ? "en" : "uz";
  const button = link
    ? `<p style="margin:0 0 8px;color:#555">${esc(LINK[lang])}</p>
<p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(BUTTON[lang][purpose])}</a></p>`
    : "";
  return {
    subject: `${L.s}: ${code}`,
    text: `${L.h}: ${code}${link ? `\n\n${BUTTON[lang][purpose]}: ${link}` : ""}\n\n${L.n}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
<h2 style="margin:0 0 8px">Röznoma</h2><p style="margin:0 0 16px;color:#555">${esc(L.h)}:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${esc(code)}</p>
${button}<p style="color:#777;font-size:13px">${esc(L.n)}</p></div>`,
  };
}
