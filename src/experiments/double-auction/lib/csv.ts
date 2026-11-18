export function csv(rows: unknown[][], exactNumericStrings = false) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            // Protect spreadsheet users from formulas in participant-controlled names.
            if (
              typeof value === "string" &&
              !(exactNumericStrings && /^-\d+(?:\/[1-9]\d*)?$/.test(text)) &&
              /^(?:\s*[=+\-@]|[\t\r\n])/.test(text)
            )
              text = "'" + text;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
