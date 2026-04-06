import * as cheerio from "cheerio";

const $ = cheerio.load("<div><i>See</i> Example</div>");
const node = $("i")[0];

try {
    const text2 = cheerio.load(node).text();
    console.log("Success with load:", text2);
} catch (e) {
    console.log("Error with load:", e.message);
}

try {
    const text1 = $(node).text();
    console.log("Success with $():", text1);
} catch (e) {
    console.log("Error with $():", e.message);
}
