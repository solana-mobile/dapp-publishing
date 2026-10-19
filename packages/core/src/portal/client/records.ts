export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function readDeep(value: unknown, propertyPath: string): unknown {
  const parts = propertyPath.split('.');
  let current: unknown = value;

  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

export function firstString(
  value: unknown,
  paths: string[],
): string | undefined {
  for (const propertyPath of paths) {
    const candidate = readDeep(value, propertyPath);
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}
