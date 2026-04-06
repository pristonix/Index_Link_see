import * as cheerio from 'cheerio';
const str = '<p>See also M&amp;M</p> <p>M&amp;M chocolate</p>';
const $ = cheerio.load(str, { withStartIndices: true, xmlMode: true, decodeEntities: true });

console.log('p contents:', $('p').eq(1).contents()[0].data);
process.exit(0);
