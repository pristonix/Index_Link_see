import * as cheerio from 'cheerio';

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTargetId($, term) {

    const termLower = term.toLowerCase().trim();
    if (!termLower) return null;

    const blockTags = ['p', 'div', 'li', 'td', 'dt', 'dd'];
    const elements = $(blockTags.join(',')).toArray();

    for (const el of elements) {

        let text = "";

        $(el).contents().each(function () {
            if (this.type === 'text') text += this.data;
            else if (this.type === 'tag') text += $(this).text();
        });

        text = text.trim();
        const textLower = text.toLowerCase();

        if (textLower.startsWith(termLower)) {

            const regexEnd = new RegExp("^" + escapeRegex(termLower) + "(?![a-z0-9])", "i");

            if (regexEnd.test(text)) {

                const existingId =
                    $(el).attr('id') ||
                    $(el).find('[id]').first().attr('id') ||
                    $(el).find('[name]').first().attr('name');

                if (existingId) {
                    return existingId;
                }
            }
        }
    }

    return null;
}

function processHtmlContent(htmlString) {
    const regexHtml = /(<i[^>]*>\s*)?([Ss]ee(?:\s+also)?)(\s*<\/i>)?(\s+)((?:[^<>\-;,&]|&(?:[a-zA-Z0-9]+|#[0-9]+|#x[a-fA-F0-9]+);)+)/g;

    const termsToLink = new Set();
    let m;
    while ((m = regexHtml.exec(htmlString)) !== null) {
        let termUntrimmed = m[5];
        let term = termUntrimmed.trimEnd();
        if (term.toLowerCase() !== "see" && term.toLowerCase() !== "see also") {
            termsToLink.add(term);
        }
    }

    const $ = cheerio.load(htmlString, { withStartIndices: true, xmlMode: true, decodeEntities: true });

    const idInjections = [];
    const termToId = {};
    for (const term of termsToLink) {
        const id = findTargetId($, term, idInjections, () => { });
        if (id) {
            termToId[term] = id;
        }
    }

    let modifiedHtml = htmlString;
    idInjections.sort((a, b) => b.startIndex - a.startIndex);

    for (const inj of idInjections) {
        if (inj.startIndex == null) continue;

        const prefix = modifiedHtml.substring(0, inj.startIndex);
        const remaining = modifiedHtml.substring(inj.startIndex);

        const tagMatch = remaining.match(/^<([a-zA-Z0-9\-:]+)([^>]*)>/);

if (tagMatch) {

    const fullTag = tagMatch[0];

    // Check if id already exists
    if (/id\s*=/.test(fullTag)) {
        continue;
    }

    const insertPos = tagMatch[1].length + 1;

    modifiedHtml =
        prefix +
        remaining.substring(0, insertPos) +
        ` id="${inj.id}"` +
        remaining.substring(insertPos);
}
    }

    modifiedHtml = modifiedHtml.replace(regexHtml, (match, iTagStart, seeText, iTagEnd, spaces, termUntrimmed) => {
        let term = termUntrimmed.trimEnd();
        let trailingSpace = termUntrimmed.substring(term.length);

        let id = termToId[term];
        if (id) {
            return `${iTagStart || ''}${seeText}${iTagEnd || ''}${spaces}<a href="#${id}">${term}</a>${trailingSpace}`;
        } else {
            return match;
        }
    });

    return modifiedHtml;
}

const html = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>Index</title>
</head>
<body>
    <p class="index-entry"><b>M&amp;M chocolate</b>: 12, 14, 15</p>
    <p class="index-entry"><i>See also</i> M&amp;M chocolate-flavor</p>
    <div><hr></hr></div>
    <!-- <test>&123; -->
</body>
</html>`;

console.log('Result:');
console.log(processHtmlContent(html));
