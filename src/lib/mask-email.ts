/** "mdnodx@gmail.com" → "md***x@gmail.com": enough to recognise, not to read. */
export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const name = email.slice(0, at);
  const head = name.slice(0, name.length > 3 ? 2 : 1);
  const tail = name.length > 4 ? name.slice(-1) : "";
  return `${head}***${tail}${email.slice(at)}`;
}
