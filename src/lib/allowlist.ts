/** Emails allowed to use the Alpaca features (comma-separated ALLOWED_EMAILS). Read at call time. */
export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
