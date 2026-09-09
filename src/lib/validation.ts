// Hand-rolled rather than pulling in a schema library: there are two forms in
// this app and the rules fit on one screen.

export const PASSWORD_MIN_LENGTH = 8;

// Deliberately loose. Local accounts use addresses like admin@devtrack.local,
// which stricter patterns and TLD checks reject.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateSignup(input: {
  email: string;
  password: string;
  name: string;
}): string | null {
  if (!input.email) return "Email is required.";
  if (!EMAIL_PATTERN.test(input.email)) return "That is not a valid email.";
  if (input.email.length > 191) return "That email is too long.";
  if (!input.password) return "Password is required.";
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  // bcrypt silently truncates at 72 bytes, so reject rather than mislead.
  if (Buffer.byteLength(input.password, "utf8") > 72) {
    return "Password must be 72 bytes or fewer.";
  }
  if (input.name.length > 191) return "That name is too long.";
  return null;
}
