import OpenAI from "openai";
import readlineSync from "readline-sync";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Load bible.json supporting two formats:
// A) [{ reference, text }, ...]  (our tiny file)
// B) [{ name, chapters: [[verse1,...], ...] }, ...] (full KJV JSON)
let verses = [];
try {
  const data = JSON.parse(fs.readFileSync("./bible.json", "utf8"));
  if (Array.isArray(data) && data.length && data[0].reference && data[0].text) {
    // Format A
    verses = data.map(v => ({ reference: v.reference, text: v.text }));
  } else {
    // Format B
    data.forEach((book) => {
      book.chapters.forEach((chapter, cIdx) => {
        chapter.forEach((text, vIdx) => {
          verses.push({
            reference: `${book.name} ${cIdx + 1}:${vIdx + 1}`,
            text,
          });
        });
      });
    });
  }
} catch (e) {
  console.error("Error loading bible.json. Make sure it exists and is valid JSON.");
  process.exit(1);
}

function searchVerses(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return verses
    .map((v) => ({
      v,
      score: terms.reduce((s, t) => s + (v.text.toLowerCase().includes(t) ? 1 : 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.v);
}

function trim(str, n = 160) {
  return str.length <= n ? str : str.slice(0, n).trim() + "...";
}

function buildContext(query, maxVerses = 5, maxChars = 900) {
  const hits = searchVerses(query);
  const picked = [];
  let total = 0;

  for (const h of hits.slice(0, 50)) {
    const line = `${h.reference} — ${trim(h.text)}\n`;
    if (picked.length < maxVerses && total + line.length <= maxChars) {
      picked.push(line.trimEnd());
      total += line.length;
    }
    if (picked.length >= maxVerses || total >= maxChars) break;
  }

  return picked.length ? picked.join("\n") : "No specific verses were found in the local search.";
}

console.log("🙏 Welcome to the AI Bible. Ask any question about Scripture.");
console.log('Type "exit" to quit.\n');

async function main() {
  while (true) {
    const question = readlineSync.question("You: ");
    if (!question.trim()) continue;
    if (question.toLowerCase() === "exit") { console.log("Goodbye. God bless you."); break; }

    const context = buildContext(question);

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are an AI Bible assistant. Use ONLY the verses in the provided context. " +
              "Always 1) give a short, clear explanation, then 2) list the verse references you used. " +
              "If no relevant verses are in context, say so plainly and avoid speculation.",
          },
          { role: "user", content: `Question:\n${question}\n\nRelevant verses:\n${context}` },
        ],
      });

      const answer = resp.choices[0]?.message?.content?.trim() || "[No response]";
      console.log("\nAI Bible:\n" + answer + "\n");
    } catch (e) {
      console.error("\n[Error talking to OpenAI]", e.message, "\n");
    }
  }
}

main();
