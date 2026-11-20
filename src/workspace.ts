import type {
  CaseKind,
  Document,
  Passage,
  TestCase,
  Workspace,
} from "./types.ts";

export class InputError extends Error {}

const kinds: readonly CaseKind[] = [
  "direct",
  "paraphrase",
  "multi-source",
  "unsupported",
];
const keyPattern = /^[a-z0-9][a-z0-9_-]{0,59}$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function list(
  value: unknown,
  min: number,
  max: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new InputError(`${label} must have ${min}–${max} items.`);
  }
  return value;
}

export function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new InputError(`${label} must be 1–${max} characters.`);
  }
  return value.trim();
}

function key(value: unknown, label: string, used: Set<string>): string {
  const id = text(value, 60, label);
  if (!keyPattern.test(id) || used.has(id)) {
    throw new InputError(
      `${label} must be a unique lowercase ID using letters, numbers, dashes or underscores.`,
    );
  }
  used.add(id);
  return id;
}

export function readWorkspace(input: unknown): Workspace {
  const raw = object(input, "Workspace");
  const name = text(raw.name, 80, "Workspace name");
  const documentIds = new Set<string>();
  const caseIds = new Set<string>();
  let totalCharacters = 0;
  const documents = list(raw.documents, 1, 50, "Documents").map(
    (entry, index): Document => {
      const doc = object(entry, `Document ${index + 1}`);
      const id = key(doc.id, "Document ID", documentIds);
      const title = text(doc.title, 120, `Title for ${id}`);
      const sections = list(doc.sections, 1, 16, `Sections for ${id}`).map(
        (entry) => {
          const section = object(entry, "Section");
          const heading = text(
            section.heading,
            100,
            `Section heading for ${id}`,
          );
          const content = text(section.text, 8_000, `Section text for ${id}`);
          totalCharacters += content.length;
          return { heading, text: content.replace(/\r\n?/g, "\n") };
        },
      );
      return { id, title, sections };
    },
  );
  if (totalCharacters > 240_000)
    throw new InputError("Workspace text exceeds 240,000 characters.");
  const cases = list(raw.cases, 0, 100, "Test cases").map(
    (item, index): TestCase => {
      const entry = object(item, `Test case ${index + 1}`);
      const id = key(entry.id, "Test case ID", caseIds);
      const question = text(entry.question, 500, `Question for ${id}`);
      const kind = entry.kind as CaseKind;
      if (!kinds.includes(kind))
        throw new InputError(`Invalid case type for ${id}.`);
      const relevant = list(
        entry.relevant,
        0,
        20,
        `Relevant document IDs for ${id}`,
      ).map((value) => {
        if (typeof value !== "string" || !documentIds.has(value)) {
          throw new InputError(`Unknown relevant document in case ${id}.`);
        }
        return value;
      });
      const minimum =
        kind === "unsupported" ? 0 : kind === "multi-source" ? 2 : 1;
      if (
        relevant.length < minimum ||
        new Set(relevant).size !== relevant.length ||
        (kind === "unsupported" && relevant.length)
      ) {
        throw new InputError(`Incorrect relevance labels for ${id}.`);
      }
      return { id, kind, question, relevant };
    },
  );
  return { name, documents, cases };
}

export function chunk(documents: Document[]): Passage[] {
  const passages: Passage[] = [];
  for (const doc of documents) {
    doc.sections.forEach((section, index) => {
      let offset = 0;
      let part = 0;
      while (offset < section.text.length) {
        let end = Math.min(offset + 600, section.text.length);
        if (end < section.text.length) {
          const boundary = section.text.lastIndexOf(" ", end);
          if (boundary >= offset + 400) end = boundary;
        }
        const excerpt = section.text.slice(offset, end).trim();
        part++;
        if (excerpt)
          passages.push({
            id: `${doc.id}:${index + 1}.${part}`,
            docId: doc.id,
            title: doc.title,
            heading: section.heading,
            text: excerpt,
          });
        if (end === section.text.length) break;
        const next = end - 80;
        const boundary = section.text.indexOf(" ", next);
        offset =
          section.text[next - 1] === " " ||
          boundary < next ||
          boundary > next + 20
            ? next
            : boundary + 1;
      }
    });
  }
  if (passages.length > 400)
    throw new InputError("The workspace exceeds 400 passages.");
  return passages;
}

export async function fingerprint(workspace: Workspace): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([workspace.documents, workspace.cases]),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) =>
    item.toString(16).padStart(2, "0"),
  ).join("");
}
