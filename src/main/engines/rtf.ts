/**
 * Plain-text extraction from RTF, used when LibreOffice is not installed.
 * It keeps text, paragraph and tab breaks, \'xx and \uN escapes; destinations such as the font
 * table, stylesheet and embedded pictures are skipped.
 */
const SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'header',
  'footer',
  'footnote',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'generator',
  'listtable',
  'listoverridetable',
  'rsidtbl',
]);

export function rtfToText(rtf: string): string {
  const out: string[] = [];
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1;
  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const ch = rtf[i] as string;
    if (ch === '{') {
      stack.push({ skip, uc });
      i++;
      // {\* ... } and known destinations are skipped as a whole group.
      if (rtf[i] === '\\' && rtf[i + 1] === '*') skip = true;
      else if (rtf[i] === '\\') {
        const m = /^\\([a-z]+)/i.exec(rtf.slice(i, i + 20));
        if (m && SKIP_DESTINATIONS.has((m[1] as string).toLowerCase())) skip = true;
      }
    } else if (ch === '}') {
      const top = stack.pop();
      if (top) {
        skip = top.skip;
        uc = top.uc;
      }
      i++;
    } else if (ch === '\\') {
      const next = rtf[i + 1] ?? '';
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) out.push(next);
        i += 2;
      } else if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16);
        if (!skip && !Number.isNaN(code)) out.push(String.fromCharCode(code));
        i += 4;
      } else if (next === '~') {
        if (!skip) out.push(' ');
        i += 2;
      } else if (next === '-' || next === '_') {
        if (!skip) out.push(next === '_' ? '‑' : '');
        i += 2;
      } else {
        const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 40));
        if (!m) {
          i += 2;
          continue;
        }
        const word = (m[1] as string).toLowerCase();
        const arg = m[2] === undefined ? undefined : Number(m[2]);
        i += m[0].length;
        if (skip) continue;
        if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out.push('\n');
        else if (word === 'tab') out.push('\t');
        else if (word === 'emdash') out.push('—');
        else if (word === 'endash') out.push('–');
        else if (word === 'bullet') out.push('•');
        else if (word === 'lquote') out.push('‘');
        else if (word === 'rquote') out.push('’');
        else if (word === 'ldblquote') out.push('“');
        else if (word === 'rdblquote') out.push('”');
        else if (word === 'uc' && arg !== undefined) uc = arg;
        else if (word === 'u' && arg !== undefined) {
          out.push(String.fromCharCode(arg < 0 ? arg + 65536 : arg));
          // The next `uc` characters are a fallback for readers without Unicode support.
          let skipChars = uc;
          while (skipChars > 0 && i < n) {
            if (rtf[i] === '\\' && rtf[i + 1] === "'") i += 4;
            else i++;
            skipChars--;
          }
        }
      }
    } else {
      if (!skip && ch !== '\r' && ch !== '\n') out.push(ch);
      i++;
    }
  }
  return (
    out
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}
