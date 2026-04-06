import * as cheerio from "cheerio";

function normalizeTerm(term) {
    return term
        .toLowerCase()
        .replace(/\(.*/, "")
        .replace(/[–—]/g, "-")
        .replace(/-/g, " ")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const htmlContext = `
<ul>
<li id="idx6" epub:type="index-entry"><span epub:type="index-term">reconstruction tracking. <i>See</i> Indonesia&#x2019;s financial tracking system for reconstruction</span></li>
</ul>
`;

const $ = cheerio.load(htmlContext, { xmlMode: true, decodeEntities: true });
const mainTerm = "Indonesia&#x2019;s financial tracking system for reconstruction";
const decodedTerm = cheerio.load(mainTerm).text();
console.log("Decoded:" + decodedTerm);
console.log("Normalized:" + normalizeTerm(decodedTerm));
