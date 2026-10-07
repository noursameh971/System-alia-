import { Fragment, type ReactNode } from "react";

/**
 * Just enough Markdown for the assistant's replies — paragraphs, bullet and
 * numbered lists, tables, **bold** and `code` — built as React elements.
 * Never HTML: replies can quote text from the database (expense titles,
 * supplier names), so nothing here is ever injected as markup.
 *
 * dir="auto" on every block lets an Arabic reply lay out right-to-left even
 * when the app is in English, and vice versa.
 */

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] dark:bg-slate-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function Block({ block }: { block: string }) {
  const lines = block.split("\n").filter((line) => line.trim());

  if (lines.length >= 2 && lines[0]!.includes("|") && TABLE_SEPARATOR.test(lines[1]!)) {
    const [head, , ...body] = lines;
    return (
      <div className="overflow-x-auto">
        <table dir="auto" className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {cells(head!).map((cell, index) => (
                <th key={index} className="border-b border-slate-200 px-2 py-1 text-start font-semibold dark:border-slate-700">
                  {inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {cells(row).map((cell, index) => (
                  <td key={index} className="border-b border-slate-100 px-2 py-1 tabular-nums dark:border-slate-800">
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (lines.every((line) => BULLET.test(line))) {
    return (
      <ul dir="auto" className="list-disc space-y-0.5 ps-5">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.replace(BULLET, ""))}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((line) => NUMBERED.test(line))) {
    return (
      <ol dir="auto" className="list-decimal space-y-0.5 ps-5">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.replace(NUMBERED, ""))}</li>
        ))}
      </ol>
    );
  }

  return (
    <p dir="auto">
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {/^#{1,6}\s/.test(line) ? <strong className="font-semibold">{inline(line.replace(/^#{1,6}\s+/, ""))}</strong> : inline(line)}
        </Fragment>
      ))}
    </p>
  );
}

function lineKind(line: string): "bullet" | "numbered" | "table" | "text" {
  if (BULLET.test(line)) return "bullet";
  if (NUMBERED.test(line)) return "numbered";
  if (line.trim().startsWith("|")) return "table";
  return "text";
}

/** "Here's the breakdown:" followed directly by "- Rent: …" is two blocks, not one — split wherever the kind of line changes. */
function splitBlocks(text: string): string[] {
  const blocks: string[][] = [];
  let previous: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      previous = null;
      continue;
    }
    const kind = lineKind(line);
    if (kind !== previous || blocks.length === 0) blocks.push([]);
    blocks.at(-1)!.push(line);
    previous = kind;
  }
  return blocks.map((lines) => lines.join("\n"));
}

export function MessageText({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
