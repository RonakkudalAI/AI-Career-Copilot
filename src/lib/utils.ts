export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function completionScore(values: Array<unknown>) {
  if (!values.length) return 0;
  return Math.round((values.filter((value) => Boolean(String(value ?? "").trim())).length / values.length) * 100);
}

export function isValidCareerFile(file: Pick<File, "name" | "size">) {
  return /\.(pdf|docx)$/i.test(file.name) && file.size <= 10 * 1024 * 1024;
}
