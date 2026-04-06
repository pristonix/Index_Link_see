import * as cheerio from 'cheerio';
const str = '\n  <p class="hello">testing 123</p>';
const $ = cheerio.load(str, { withStartIndices: true, xmlMode: true, decodeEntities: true });
const el = $('p')[0];

console.log('startIndex:', el.startIndex);
console.log('original tag text:', str.substring(el.startIndex, el.startIndex + 10));
process.exit(0);
