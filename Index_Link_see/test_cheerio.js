import * as cheerio from 'cheerio';

const html = '<p class="index-entry"><i>See also</i> entity&#38;test Pakistan-India</p>';

const $ = cheerio.load(html, { xmlMode: true, decodeEntities: true });

console.log('Result:', $.xml());
