/**
 * Minimal, dependency-free CSV parser supporting quoted fields, escaped quotes
 * ("" inside quotes), and CRLF/LF line endings. Good enough for contact import;
 * not a full RFC-4180 streaming parser.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // handled by the \n branch; skip lone CR
    } else {
      field += char;
    }
  }

  // flush trailing field/row (if the file doesn't end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface ContactCsvRow {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
}

const HEADER_ALIASES: Record<string, keyof ContactCsvRow> = {
  firstname: "firstName",
  "first name": "firstName",
  first: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  last: "lastName",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  title: "title",
  "job title": "title",
  company: "company",
  "company name": "company",
  organization: "company",
};

export interface CsvMapResult {
  rows: ContactCsvRow[];
  errors: string[];
}

/**
 * Map parsed CSV cells to contact rows using a header row. Requires a column
 * that maps to firstName. Rows missing a first name are skipped with an error.
 */
export function mapContactCsv(table: string[][]): CsvMapResult {
  const errors: string[] = [];
  if (table.length === 0) {
    return { rows: [], errors: ["The file is empty"] };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const indexOf: Partial<Record<keyof ContactCsvRow, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && indexOf[key] === undefined) indexOf[key] = i;
  });

  if (indexOf.firstName === undefined) {
    return {
      rows: [],
      errors: ['Missing a required "first name" column'],
    };
  }

  const rows: ContactCsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (key: keyof ContactCsvRow) => {
      const idx = indexOf[key];
      return idx === undefined ? undefined : cells[idx]?.trim() || undefined;
    };
    const firstName = get("firstName");
    if (!firstName) {
      errors.push(`Row ${r + 1}: missing first name, skipped`);
      continue;
    }
    rows.push({
      firstName,
      lastName: get("lastName"),
      email: get("email"),
      phone: get("phone"),
      title: get("title"),
      company: get("company"),
    });
  }

  return { rows, errors };
}
