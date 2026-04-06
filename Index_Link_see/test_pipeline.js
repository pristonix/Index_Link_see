console.log("Script started...");
import * as cheerio from "cheerio";

/* -------------------------
   Normalize index terms
-------------------------- */

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

/* -------------------------
   Extract term nodes safely
-------------------------- */

function extractTermParts($li) {

    const children = $li.contents().toArray();

    const termNodes = [];
    const restNodes = [];

    let separatorFound = false;

    children.forEach(node => {

        if (separatorFound) {
            restNodes.push(node);
            return;
        }

        if (node.type === "text") {

            const text = node.data;

            const match = text.match(/([,:;(])/);

            if (match) {

                const idx = text.indexOf(match[1]);

                const termText = text.slice(0, idx);
                const restText = text.slice(idx);

                if (termText.trim()) {
                    termNodes.push({ type: "text", data: termText });
                }

                restNodes.push({ type: "text", data: restText });

                separatorFound = true;

            } else {

                termNodes.push(node);

            }

        } else {

            termNodes.push(node);

        }

    });

    return { termNodes, restNodes };
}

/* -------------------------
   Convert <li> → index entry
-------------------------- */

function convertIndexEntries($) {

    let counter = 1;

    $("li").each(function () {

        const $li = $(this);

        if ($li.attr("epub:type") === "index-entry") return;

        const text = $li.text().trim().toLowerCase();

        if (
            text.startsWith("see ") ||
            text.startsWith("see also") ||
            text.startsWith("see under")
        ) return;

        if (!$li.attr("id")) {

            $li.attr("id", "idx" + counter);
            counter++;

        }

        $li.attr("epub:type", "index-entry");

        const { termNodes, restNodes } = extractTermParts($li);

        if (!termNodes.length) return;

        const span = $('<span epub:type="index-term"></span>');

        termNodes.forEach(node => span.append(node));

        $li.empty();

        $li.append(span);

        restNodes.forEach(node => $li.append(node));

    });

}

/* -------------------------
   Build term → id map
-------------------------- */

function buildIndexMap($) {

    const map = {};

    $('[epub\\:type="index-entry"]').each(function () {

        const $li = $(this);

        const term = $li
            .find('[epub\\:type="index-term"]')
            .text()
            .trim();

        const id = $li.attr("id");

        if (!term || !id) return;

        const normalized = normalizeTerm(term);

        map[normalized] = id;

    });

    return map;
}

/* -------------------------
   Link cross references
-------------------------- */

function linkCrossReferences($, termMap) {

    $("li").each(function () {

        const $li = $(this);

        const html = $li.html();

        if (!html) return;

        const regex =
            /(<i[^>]*>\s*)(See(?:\s+also|\s+under)?)(\s*<\/i>)(\s+)([^<]+)/i;

        const match = html.match(regex);

        if (!match) return;

        let phrase = match[5].trim();

        /* remove trailing sub phrases */
        const mainTerm = phrase
            .replace(/\(.*/, "")
            .replace(/,.*/, "")
            .trim();

        const normalized = normalizeTerm(mainTerm);

        const id = termMap[normalized];

        if (!id) return;

        const link = `<a href="#${id}">${mainTerm}</a>`;

        const rest = phrase.substring(mainTerm.length);

        const newHtml =
            `${match[1]}${match[2]}${match[3]} ${link}${rest}`;

        $li.html(html.replace(regex, newHtml));

    });

}

/* -------------------------
   Main processing
-------------------------- */

function processHtmlContent(htmlString) {

    const $ = cheerio.load(htmlString, {
        xmlMode: true,
        decodeEntities: true
    });

    /* Step 1 */
    convertIndexEntries($);

    /* Step 2 */
    const termMap = buildIndexMap($);

    /* Step 3 */
    linkCrossReferences($, termMap);

    return $.xml();
}

/* -------------------------
   Example
-------------------------- */

const html = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Index</title>
</head>

<body>

<ul>
<li>M&amp;M chocolate: 12,14,15</li>
<li><i>Governance Indicators 2006</i>, 45</li>
<li>M&amp;M chocolate-flavor</li>
<li><i>See also</i> M&amp;M chocolate-flavor</li>
<li><i>See</i> sub-Saharan Africa</li>
<li><i>See</i> sub-Saharan Africa, history</li>
</ul>

</body>
</html>`;

console.log(processHtmlContent(html));

console.log("New Version")