export function toTitleCaseWithYmcaAndOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const lowerWords = new Set(["of"]);
  return value
    .split(" ")
    .filter(Boolean)
    .map((word, idx) => {
      const upper = word.toUpperCase();
      if (upper === "YMCA") return "YMCA";
      if (upper === "YMCAS") return "YMCAs";
      const lower = word.toLowerCase();
      if (idx !== 0 && lowerWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}


