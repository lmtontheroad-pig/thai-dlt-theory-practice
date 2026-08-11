import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const site = root;
const [dataText, translationText, html, css, app, localServer, startScript] = await Promise.all([
  fs.readFile(path.join(site, "data", "questions_bilingual.json"), "utf8"),
  fs.readFile(path.join(site, "source", "questions_translated_zh.json"), "utf8"),
  fs.readFile(path.join(site, "index.html"), "utf8"),
  fs.readFile(path.join(site, "styles.css"), "utf8"),
  fs.readFile(path.join(site, "app.js"), "utf8"),
  fs.readFile(path.join(site, "scripts", "local-server.mjs"), "utf8"),
  fs.readFile(path.join(site, "start-local.cmd"), "utf8"),
]);
const data = JSON.parse(dataText);
const translations = JSON.parse(translationText);
const translationById = new Map(translations.map((item) => [item.id, item]));
const ids = new Set(data.questions.map((item) => item.id));
const fingerprints = new Set(data.questions.map((item) => item.fingerprint));
const imageRefs = new Set(data.questions.flatMap((question) => [
  ...(question.question_images ?? []),
  ...question.options.flatMap((option) => option.images ?? []),
]).filter(Boolean));

const missingImages = [];
const brokenImages = [];
for (const relative of imageRefs) {
  const absolute = path.join(site, ...relative.split("/"));
  let bytes;
  try { bytes = await fs.readFile(absolute); } catch { missingImages.push(relative); continue; }
  const ascii = bytes.subarray(0, 12).toString("ascii");
  const valid =
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    || (bytes[0] === 0xff && bytes[1] === 0xd8)
    || ascii.startsWith("GIF")
    || (ascii.startsWith("RIFF") && ascii.includes("WEBP"));
  if (!valid) brokenImages.push(relative);
}

const imageFiles = await fs.readdir(path.join(site, "assets", "images"));
const htmlIds = [...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]);
const duplicateHtmlIds = [...new Set(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index))];
const jsIdSelectors = [...new Set([...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]))];
const missingSelectors = jsIdSelectors.filter((id) => !htmlIds.includes(id));
const featureTokens = ["localStorage", "data-mode=\"exam\"", "answer_status", "correct_answer", "data-language", "showModal", "performSearch"];
const missingFeatures = featureTokens.filter((token) => !app.includes(token) && !html.includes(token));
const feedbackTokens = ["/api/feedback", "issueQuestionId", "feedback/issues.json", "local-server.mjs"];
const feedbackSurface = `${html}\n${app}\n${localServer}\n${startScript}`;
const missingFeedbackFeatures = feedbackTokens.filter((token) => !feedbackSurface.includes(token));
const startScriptAsciiOnly = !/[^\x00-\x7F]/.test(startScript);
const runtimeNetworkRefs = [...`${html}\n${css}\n${app}`.matchAll(/https?:\/\//g)].length;
const translationMismatches = data.questions.filter((question) => {
  const translated = translationById.get(question.id);
  if (!translated || translated.question_zh !== question.question_zh || translated.category_zh !== question.category_zh) return true;
  return question.options.some((option) => translated.options_zh?.[option.key] !== option.text_zh);
});
const imageOnlyOptionGaps = data.questions.flatMap((question) => question.options.filter((option) =>
  /รายละเอียด.*ภาพ|ปรากฏ.*ภาพ/.test(option.text_th) && !(option.images ?? []).length,
).map((option) => `${question.id}-${option.key}`));

const result = {
  questions: data.questions.length,
  confirmed: data.questions.filter((item) => item.answer_status === "confirmed").length,
  unknown: data.questions.filter((item) => item.answer_status === "unknown").length,
  unique_ids: ids.size,
  unique_fingerprints: fingerprints.size,
  image_questions: data.questions.filter((item) => item.image_status !== "none").length,
  substituted_image_questions: data.questions.filter((item) => item.image_status === "substituted").length,
  unique_image_refs: imageRefs.size,
  image_files: imageFiles.length,
  missing_images: missingImages.length,
  broken_images: brokenImages.length,
  duplicate_html_ids: duplicateHtmlIds.length,
  missing_js_selectors: missingSelectors.length,
  missing_feature_tokens: missingFeatures,
  missing_feedback_tokens: missingFeedbackFeatures,
  start_script_ascii_only: startScriptAsciiOnly,
  runtime_network_refs: runtimeNetworkRefs,
  translation_mismatches: translationMismatches.length,
  image_only_option_gaps: imageOnlyOptionGaps.length,
};

const failed = result.questions !== 329
  || result.confirmed !== 329
  || result.unique_ids !== 329
  || result.unique_fingerprints !== 329
  || result.missing_images > 0
  || result.broken_images > 0
  || result.duplicate_html_ids > 0
  || result.missing_js_selectors > 0
  || result.missing_feature_tokens.length > 0
  || result.missing_feedback_tokens.length > 0
  || !result.start_script_ascii_only
  || result.runtime_network_refs > 0
  || result.translation_mismatches > 0
  || result.image_only_option_gaps > 0;
console.log(JSON.stringify(result));
if (failed) process.exitCode = 1;
