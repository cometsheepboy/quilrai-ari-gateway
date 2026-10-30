
const PII_PATTERNS = [
  // Email addresses
  /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,189}\.[A-Z]{2,24}/gi,

  // US Social Security Numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,

  // Credit card numbers: 13-19 digits, optionally separated
  /\b(?:\d[ -]?){12,18}\d\b/g,
];

// Maximum supported email length is 279 characters.
// Retain a little extra context for safe boundary handling.
const HOLD_BACK = 280;

export class PiiRedactor {
  private pending = "";

  /**
   * Accept a new text chunk.
   * Return only text that is safe to release.
   */
  push(chunk: string): string {
    this.pending += chunk;

    return this.releaseSafeText(false);
  }

  /**
   * Flush remaining text when the stream ends.
   */
  flush(): string {
    return this.releaseSafeText(true);
  }

  private releaseSafeText(final: boolean): string {
    if (!this.pending) {
      return "";
    }

    let safeEnd = final
      ? this.pending.length
      : Math.max(0, this.pending.length - HOLD_BACK);

    // Don't split a detected PII match at the release boundary.
    for (const pattern of PII_PATTERNS) {
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;

      while ((match = pattern.exec(this.pending)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        if (start < safeEnd && end > safeEnd) {
          safeEnd = start;
        }
      }
    }

    if (safeEnd === 0) {
      return "";
    }

    const safeText = this.pending.slice(0, safeEnd);

    this.pending = this.pending.slice(safeEnd);

    return this.redact(safeText);
  }

  private redact(text: string): string {
    let result = text;

    for (const pattern of PII_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, "[REDACTED]");
    }

    return result;
  }
}
