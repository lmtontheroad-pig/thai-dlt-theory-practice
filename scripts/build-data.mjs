import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "source", "questions_th.json");
const translationPath = path.join(root, "source", "questions_translated_zh.json");
const overridesPath = path.join(root, "source", "image_overrides.json");
const siteRoot = root;
const dataDir = path.join(siteRoot, "data");
const siteImages = path.join(siteRoot, "assets", "images");

const [sourceQuestions, translations, imageOverrides] = await Promise.all([
  fs.readFile(sourcePath, "utf8").then(JSON.parse),
  fs.readFile(translationPath, "utf8").then(JSON.parse),
  fs.readFile(overridesPath, "utf8").then(JSON.parse),
]);

const translationById = new Map(translations.map((item) => [item.id, item]));
const sourceIds = new Set(sourceQuestions.map((item) => item.id));
if (sourceQuestions.length !== translations.length || translationById.size !== translations.length) {
  throw new Error(`Record mismatch: source=${sourceQuestions.length}, translation=${translations.length}, unique translations=${translationById.size}`);
}
for (const id of sourceIds) {
  if (!translationById.has(id)) throw new Error(`Missing translation: ${id}`);
}

const questions = sourceQuestions.map((source) => {
  const translated = translationById.get(source.id);
  const translatedOptions = translated.options_zh ?? {};
  const options = source.options.map((option) => ({
    key: option.key,
    text_th: option.text_th ?? "",
    text_zh: translatedOptions[option.key] ?? "",
    image: option.image ?? "",
    images: option.images ?? (option.image ? [option.image] : []),
  }));
  if (options.length !== 4 || options.some((option) => !["A", "B", "C", "D"].includes(option.key))) {
    throw new Error(`Invalid options: ${source.id}`);
  }
  return {
    id: source.id,
    category_th: source.category_th ?? "",
    category_zh: translated.category_zh ?? "",
    question_th: source.question_th ?? "",
    question_zh: translated.question_zh ?? "",
    options,
    question_image: source.question_image ?? "",
    question_images: source.question_images ?? (source.question_image ? [source.question_image] : []),
    correct_answer: source.correct_answer ?? null,
    answer_status: source.answer_status ?? "unknown",
    answer_source: source.answer_source ?? "",
    explanation_th: source.explanation_th ?? "",
    explanation_zh: translated.explanation_zh ?? "",
    image_status: source.image_status ?? "none",
    missing_image_sources: source.missing_image_sources ?? [],
    image_note: "",
    image_substitution_source_id: null,
    fingerprint: source.fingerprint,
  };
});

const questionById = new Map(questions.map((question) => [question.id, question]));
const aliasCopies = [];
for (const [targetId, override] of Object.entries(imageOverrides)) {
  const target = questionById.get(targetId);
  const source = questionById.get(override.source_id);
  if (!target || !source) throw new Error(`Invalid image override ${targetId} <- ${override.source_id}`);
  for (const [targetKey, sourceKey] of Object.entries(override.option_map)) {
    const targetOption = target.options.find((option) => option.key === targetKey);
    const sourceOption = source.options.find((option) => option.key === sourceKey);
    if (!targetOption || !sourceOption?.images?.length) throw new Error(`Image override has no source image: ${targetId}.${targetKey} <- ${override.source_id}.${sourceKey}`);
    const aliases = sourceOption.images.map((sourceRelative, index) => {
      const extension = path.extname(sourceRelative);
      const suffix = sourceOption.images.length > 1 ? `-${index + 1}` : "";
      const targetRelative = `assets/images/${targetId}-${targetKey}-substitute${suffix}${extension}`;
      aliasCopies.push({ sourceRelative, targetRelative });
      return targetRelative;
    });
    targetOption.images = aliases;
    targetOption.image = aliases[0] ?? "";
  }
  target.image_status = "substituted";
  target.image_note = override.note;
  target.image_substitution_source_id = override.source_id;
}

const categories = [...new Map(questions.map((question) => [
  `${question.category_zh}\u0000${question.category_th}`,
  { zh: question.category_zh, th: question.category_th },
])).values()].sort((left, right) => left.zh.localeCompare(right.zh, "zh-CN"));

const payload = {
  meta: {
    title: "SafeDrive DLT 泰国驾照理论练习",
    generated_at: new Date().toISOString(),
    question_count: questions.length,
    confirmed_count: questions.filter((item) => item.answer_status === "confirmed").length,
    unknown_count: questions.filter((item) => item.answer_status === "unknown").length,
    image_question_count: questions.filter((item) => item.image_status !== "none").length,
    partial_image_count: questions.filter((item) => item.image_status === "partial").length,
    substituted_image_question_count: questions.filter((item) => item.image_status === "substituted").length,
  },
  categories,
  questions,
};

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(siteImages, { recursive: true });
for (const alias of aliasCopies) {
  await fs.copyFile(
    path.join(siteRoot, ...alias.sourceRelative.split("/")),
    path.join(siteRoot, ...alias.targetRelative.split("/")),
  );
}
await Promise.all([
  fs.writeFile(path.join(dataDir, "questions_bilingual.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8"),
  fs.writeFile(path.join(dataDir, "questions.js"), `window.SDLT_DATA = ${JSON.stringify(payload)};\n`, "utf8"),
]);

const imageFiles = await fs.readdir(siteImages);
for (const question of questions) {
  const paths = [
    ...(question.question_images ?? []),
    ...question.options.flatMap((option) => option.images ?? []),
  ].filter(Boolean);
  for (const relativePath of paths) {
    const fileName = path.basename(relativePath);
    if (!imageFiles.includes(fileName)) throw new Error(`Missing local image ${fileName} for ${question.id}`);
    if (!fileName.startsWith(`${question.id}-`)) throw new Error(`Image ID mismatch ${fileName} for ${question.id}`);
  }
}

console.log(JSON.stringify({
  questions: questions.length,
  confirmed: payload.meta.confirmed_count,
  unknown: payload.meta.unknown_count,
  image_questions: payload.meta.image_question_count,
  partial_images: payload.meta.partial_image_count,
  substituted_images: payload.meta.substituted_image_question_count,
  image_files: imageFiles.length,
  categories: categories.length,
}));
