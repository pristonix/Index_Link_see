import fs from 'fs';

function processHtmlContent(htmlString) {
  let resultHtml = "";
  let lastIndex = 0;
  const liOpenRegex = /<li((?:\s[^>]*?)?)>/gi;
  let liMatch;
  let liCounter = 1;

  while ((liMatch = liOpenRegex.exec(htmlString)) !== null) {
      resultHtml += htmlString.substring(lastIndex, liMatch.index);
      
      let attrs = liMatch[1] || "";
      
      if (!/epub:type=/i.test(attrs)) {
          attrs += ` epub:type="index-entry"`;
      }
      
      if (!/id=['"]([^'"]+)['"]/.test(attrs)) {
          let newId = `idx${liCounter}`;
          while (htmlString.includes(`id="${newId}"`) || htmlString.includes(`id='${newId}'`)) {
              liCounter++;
              newId = `idx${liCounter}`;
          }
          attrs += ` id="${newId}"`;
          liCounter++;
      }

      resultHtml += `<li${attrs}>`;
      
      let currentIndex = liOpenRegex.lastIndex;
      let inTag = false;
      let splitAt = -1;
      let limit = Math.min(currentIndex + 1500, htmlString.length);
      
      let initialStr = htmlString.substring(currentIndex, currentIndex + 50);
      if (initialStr.match(/^\s*(?:<[^>]+>\s*)*[Ss]ee\b(?:\s+also|\s+under)?/i)) {
          splitAt = currentIndex;
      } else {
          for (let i = currentIndex; i < limit; i++) {
             let c = htmlString[i];
             
             if (!inTag && c === '<') {
                 let upcoming = htmlString.substring(i, i + 10).toLowerCase();
                 if (upcoming.startsWith('</li') || upcoming.startsWith('<ol') || 
                     upcoming.startsWith('<ul') || upcoming.startsWith('<dl') || 
                     upcoming.startsWith('<div') || upcoming.startsWith('<p') || 
                     upcoming.startsWith('<br')) {
                     splitAt = i;
                     break;
                 }
                 inTag = true;
             } else if (inTag && c === '>') {
                 inTag = false;
                 continue;
             }
             
             if (!inTag && c !== '>') {
                if (c === ',' || c === '\n' || c === '\r') {
                   splitAt = i;
                   break;
                }
                
                let rem = htmlString.substring(i, i + 30);
                if (rem.match(/^\s+(?:<[^>]+>\s*)*[Ss]ee\b(?:\s+also|\s+under)?/i)) {
                   splitAt = i;
                   break;
                }
             }
          }
      }
      
      let advanceToIndex = -1;

      if (splitAt !== -1 && splitAt > currentIndex) {
         let termRaw = htmlString.substring(currentIndex, splitAt);
         let leadSpaceMatch = termRaw.match(/^\s*/);
         let trailSpaceMatch = termRaw.match(/\s*$/);
         let leadSpace = leadSpaceMatch ? leadSpaceMatch[0] : "";
         let trailSpace = trailSpaceMatch ? trailSpaceMatch[0] : "";
         let termTrim = termRaw.trim();
         
         if (termTrim) {
             resultHtml += `${leadSpace}<span epub:type="index-term">${termTrim}</span>${trailSpace}`;
         } else {
             resultHtml += termRaw;
         }
         advanceToIndex = splitAt;
      } else if (splitAt === currentIndex) {
         advanceToIndex = currentIndex;
      } else if (splitAt === -1) {
         let termRaw = htmlString.substring(currentIndex, limit);
         let leadSpaceMatch = termRaw.match(/^\s*/);
         let trailSpaceMatch = termRaw.match(/\s*$/);
         let leadSpace = leadSpaceMatch ? leadSpaceMatch[0] : "";
         let trailSpace = trailSpaceMatch ? trailSpaceMatch[0] : "";
         let termTrim = termRaw.trim();
         
         if (termTrim) {
             resultHtml += `${leadSpace}<span epub:type="index-term">${termTrim}</span>${trailSpace}`;
         } else {
             resultHtml += termRaw;
         }
         advanceToIndex = limit;
      }
      
      lastIndex = advanceToIndex;
      liOpenRegex.lastIndex = advanceToIndex;
  }
  resultHtml += htmlString.substring(lastIndex);
  return resultHtml;
}

const html = `<li>baseline data
<ol class="none">
<li>importance of collecting</li>
</ol>
</li>
<li><i>See also</i> here</li>
<li>Normal term, page 4</li>
<li>Empty </li>
<li>   testing spaces   </li>
`;
fs.writeFileSync('out.html', processHtmlContent(html));
