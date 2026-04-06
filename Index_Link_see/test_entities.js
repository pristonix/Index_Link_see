import { decodeHTML, encodeHTML } from 'entities';

const html = '<i>See also</i> entity&#38;test Pakistan-India';
const regex = /(<i[^>]*>\s*)?([Ss]ee(?:\s+also)?)(\s*<\/i>)?(\s+)([^<>\-;,]+)/g;

console.log(html.replace(regex, (match, iTagStart, seeText, iTagEnd, spaces, termUntrimmed) => {
  let term = termUntrimmed.trimEnd();
  let tail = termUntrimmed.substring(term.length);
  return `${iTagStart || ''}${seeText}${iTagEnd || ''}${spaces}<a href="#test">${term}</a>${tail}`;
}));
