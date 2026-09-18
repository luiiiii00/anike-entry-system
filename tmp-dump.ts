import { EVALUATION_SETUP_IDS, getActiveQuestionsBySetup } from "./src/lib/checklist";
for (const s of EVALUATION_SETUP_IDS) {
  const qs = getActiveQuestionsBySetup(s);
  console.log("==", s, qs.length);
  for (const q of qs) console.log(` ${q.sectionId}\t${q.id}\tmeta=${q.meta?1:0}\topts=${q.options.length}\tpts=${q.options.map(o=>o.pts).join("/")}\t${q.label.slice(0,70)}`);
}
