/** Password rules, shared by the forms and the server. */
export const PASSWORD_RULES = {
  length: (p: string) => p.length >= 8,
  lower: (p: string) => /\p{Ll}/u.test(p),
  upper: (p: string) => /\p{Lu}/u.test(p),
  digit: (p: string) => /\d/.test(p),
} as const;
export type PasswordRule = keyof typeof PASSWORD_RULES;

export const passwordOk = (p: string) =>
  p.length <= 128 && Object.values(PASSWORD_RULES).every((r) => r(p));
