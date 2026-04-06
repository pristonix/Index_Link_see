import * as cheerio from "cheerio";

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
                const matchPeriod = text.match(/(\.)\s*$/);
                if (matchPeriod) {
                    const idx = text.lastIndexOf(matchPeriod[1]);
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
            }
        } else if (node.type === "tag" && (node.name === "i" || node.name === "em")) {
            const tagText = cheerio.load(node).text().trim().toLowerCase();
            if (tagText.startsWith("see")) {
                separatorFound = true;
                restNodes.push(node);
            } else {
                termNodes.push(node);
            }
        } else if (node.type === "tag" && (node.name === "ol" || node.name === "ul" || node.name === "dl")) {
            separatorFound = true;
            restNodes.push(node);
        } else {
            termNodes.push(node);
        }
    });

    return { termNodes, restNodes };
}

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

const htmlContext = `
<ul>
<li>poverty and disasters
<ol class="none">
<li>nested item</li>
</ol>
</li>
</ul>
`;

const $ = cheerio.load(htmlContext, { xmlMode: true, decodeEntities: true });
convertIndexEntries($);
console.log($.xml());
