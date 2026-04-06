const html1 = '<i>See also</i> entity&#38;test Pakistan-India';
const html2 = 'See also entity&amp;test Pakistan-India';
const html3 = 'See also &quot;The Test&quot;-test';
const html4 = 'See also Normal-Test';

// Match see/see also
// Following word handles: normal chars AND HTML entities (&...;) up until next delimiter
const regex = /(<i[^>]*>\s*)?([Ss]ee(?:\s+also)?)(\s*<\/i>)?(\s+)((?:[^<>\-;,&]|&(?:[a-z0-9]+|#[0-9]+|#x[a-f0-9]+);)+)/gi;

function testMatch(html) {
    console.log("Input:", html);
    let m;
    while((m = regex.exec(html)) !== null) {
        console.log("  Match:", m[5].trim());
    }
}

testMatch(html1);
testMatch(html2);
testMatch(html3);
testMatch(html4);
 