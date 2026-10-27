export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEED_QUOTES = /[",\r\n]/;

function cellToCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && (FORMULA_START.test(text))) {
    text = `'${text}`;
  }
  if (NEED_QUOTES.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
export function toCsvRow(values: CsvValue[]): string {
  return values.map(cellToCsv).join(",");
}
