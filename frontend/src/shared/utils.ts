export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function isValidCareerFile(file: Pick<File, "name" | "size">) {
  return /\.(pdf|docx)$/i.test(file.name) && file.size <= 10 * 1024 * 1024;
}
