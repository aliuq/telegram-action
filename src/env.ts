/**
 * Read a required environment variable and trim surrounding whitespace.
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

/**
 * Read an optional environment variable and normalize missing values to `""`.
 */
export function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}
