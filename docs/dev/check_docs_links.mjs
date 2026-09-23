#!/usr/bin/env node
// Link checker for docs/dev/**/*.md.
//
// docs/dev is full of relative markdown links and heading-anchor cross-references (the
// architecture.md split, backend-comparison.md, perf-findings.md, roadmap.md, ...) that were
// previously only checkable by eye. This script covers every place that can point into docs/dev:
//
//   - every file under docs/dev/ (full link coverage: file existence + anchor); and
//   - every other docs/**/*.md file, for any link (relative, or an absolute GitHub blob URL into
//     this repo) whose target resolves into docs/dev/. Links to anything else in those files are
//     out of scope for this checker.
//
// docs/src/notebooks/ is skipped if a stale checkout still has it: the whole-notebook
// HTML export is gone, so those links are not part of the source tree this script walks.
// Documenter `[Label](@ref)` cross-references are
// left alone too -- Documenter resolves those itself during the site build, not this script.
//
// It fails loud on any in-scope link whose target file or heading anchor does not actually exist.
//
// Run in CI by the `docs-links` job in .github/workflows/CI.yml; runnable locally too:
// node docs/dev/check_docs_links.mjs
//
// Anchor slugs are computed with GitHub's own heading-slug algorithm, reproduced here from the
// `github-slugger` package (MIT licensed, https://github.com/Flet/github-slugger) so this script
// has no npm dependency. Do not hand-edit SLUG_STRIP_RE; regenerate it from that package if
// GitHub's slugging rules ever change.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const DOCS_ROOT = join(REPO_ROOT, "docs");
const DOCS_DEV_DIR = join(REPO_ROOT, "docs", "dev");

// Directories walkMarkdownFiles never descends into: a stale docs/src/notebooks
// directory (see header); node_modules is excluded defensively wherever it turns up
// (there is none under docs/ today, but a link checker should not choke on one appearing).
const EXCLUDED_DIRS = new Set([join(REPO_ROOT, "docs", "src", "notebooks")]);

// e.g. https://github.com/jowch/Masque.jl/blob/main/docs/dev/architecture/10-tooltips.md#10-tooltips
// Owner/repo is pinned to this repo, not a wildcard -- a blob URL into some other GitHub repo
// (e.g. a Makie.jl doc link) must NOT be resolved against our own local tree.
const GITHUB_BLOB_RE = /^https?:\/\/github\.com\/jowch\/Masque\.jl\/blob\/[^/]+\/(.+)$/i;

// Verbatim from github-slugger's regex.js (BananaSlug), covers the Unicode punctuation ranges
// GitHub strips when computing a heading anchor.
const SLUG_STRIP_RE = /[\0-\x1F!-,\.\/:-@\[-\^`\{-\xA9\xAB-\xB4\xB6-\xB9\xBB-\xBF\xD7\xF7˂-˅˒-˟˥-˫˭˯-˿͵͸͹;΀-΅·΋΍΢϶҂԰՗՘՚-՟։-֐־׀׃׆׈-׏׫-׮׳-؏؛-؟٪-٭۔۝۞۩۽۾܀-܏݋݌޲-޿߶-߹߻߼߾߿࠮-࠿࡜-࡟࡫-࢟ࢵࣈ-࣒࣢।॥॰঄঍঎঑঒঩঱঳-঵঺঻৅৆৉৊৏-৖৘-৛৞৤৥৲-৻৽৿਀਄਋-਎਑਒਩਱਴਷਺਻਽੃-੆੉੊੎-੐੒-੘੝੟-੥੶-઀઄઎઒઩઱઴઺઻૆૊૎૏૑-૟૤૥૰-૸଀଄଍଎଑଒଩଱଴଺଻୅୆୉୊୎-୔୘-୛୞୤୥୰୲-஁஄஋-஍஑஖-஘஛஝஠-஢஥-஧஫-஭஺-஽௃-௅௉௎௏௑-௖௘-௥௰-௿఍఑఩఺-఼౅౉౎-౔౗౛-౟౤౥౰-౿಄಍಑಩಴಺಻೅೉೎-೔೗-ೝ೟೤೥೰ೳ-೿഍഑൅൉൏-൓൘-൞൤൥൰-൹඀඄඗-඙඲඼඾඿෇-෉෋-෎෕෗෠-෥෰෱෴-฀฻-฿๏๚-຀຃຅຋຤຦຾຿໅໇໎໏໚໛໠-໿༁-༗༚-༟༪-༴༶༸༺-༽཈཭-཰྅྘྽-࿅࿇-࿿၊-၏႞႟჆჈-჌჎჏჻቉቎቏቗቙቞቟኉኎኏኱኶኷኿዁዆዇዗጑጖጗፛፜፠-፿᎐-᎟᏶᏷᏾-᐀᙭᙮ ᚛-᚟᛫-᛭᛹-᛿ᜍ᜕-ᜟ᜵-᜿᝔-᝟᝭᝱᝴-᝿។-៖៘-៛៞៟៪-᠊᠎᠏᠚-᠟᡹-᡿᢫-᢯᣶-᣿᤟᤬-᤯᤼-᥅᥮᥯᥵-᥿᦬-᦯᧊-᧏᧚-᧿᨜-᨟᩟᩽᩾᪊-᪏᪚-᪦᪨-᪯᫁-᫿ᭌ-᭏᭚-᭪᭴-᭿᯴-᯿᰸-᰿᱊-᱌᱾᱿Ᲊ-᲏᲻᲼᳀-᳏᳓᳻-᳿᷺἖἗἞἟὆὇὎὏὘὚὜὞὾὿᾵᾽᾿-῁῅῍-῏῔῕῜-῟῭-῱῵´-‾⁁-⁓⁕-⁰⁲-⁾₀-₏₝-⃏⃱-℁℃-℆℈℉℔№-℘℞-℣℥℧℩℮℺℻⅀-⅄⅊-⅍⅏-⅟↉-⒵⓪-⯿Ⱟⱟ⳥-⳪⳴-⳿⴦⴨-⴬⴮⴯⵨-⵮⵰-⵾⶗-⶟⶧⶯⶷⶿⷇⷏⷗⷟⸀-⸮⸰-〄〈-〠〰〶〷〽-぀゗゘゛゜゠・㄀-㄄㄰㆏-㆟㇀-㇯㈀-㏿䷀-䷿鿽-鿿꒍-꓏꓾꓿꘍-꘏꘬-꘿꙳꙾꛲-꜖꜠꜡꞉꞊ꟀꟁꟋ-ꟴ꠨-꠫꠭-꠿꡴-꡿꣆-꣏꣚-꣟꣸-꣺꣼꤮꤯꥔-꥟꥽-꥿꧁-꧎꧚-꧟꧿꨷-꨿꩎꩏꩚-꩟꩷-꩹꫃-꫚꫞꫟꫰꫱꫷-꬀꬇꬈꬏꬐꬗-꬟꬧꬯꭛꭪-꭯꯫꯮꯯꯺-꯿힤-힯퟇-퟊퟼-퟿-﩮﩯﫚-﫿﬇-﬒﬘-﬜﬩﬷﬽﬿﭂﭅﮲-﯒﴾-﵏﶐﶑﷈-﷯﷼-﷿︐-︟︰-︲︵-﹌﹐-﹯﹵﻽-／：-＠［-＾｀｛-･﾿-￁￈￉￐￑￘￙￝-￿]|\uD800[\uDC0C\uDC27\uDC3B\uDC3E\uDC4E\uDC4F\uDC5E-\uDC7F\uDCFB-\uDD3F\uDD75-\uDDFC\uDDFE-\uDE7F\uDE9D-\uDE9F\uDED1-\uDEDF\uDEE1-\uDEFF\uDF20-\uDF2C\uDF4B-\uDF4F\uDF7B-\uDF7F\uDF9E\uDF9F\uDFC4-\uDFC7\uDFD0\uDFD6-\uDFFF]|\uD801[\uDC9E\uDC9F\uDCAA-\uDCAF\uDCD4-\uDCD7\uDCFC-\uDCFF\uDD28-\uDD2F\uDD64-\uDDFF\uDF37-\uDF3F\uDF56-\uDF5F\uDF68-\uDFFF]|\uD802[\uDC06\uDC07\uDC09\uDC36\uDC39-\uDC3B\uDC3D\uDC3E\uDC56-\uDC5F\uDC77-\uDC7F\uDC9F-\uDCDF\uDCF3\uDCF6-\uDCFF\uDD16-\uDD1F\uDD3A-\uDD7F\uDDB8-\uDDBD\uDDC0-\uDDFF\uDE04\uDE07-\uDE0B\uDE14\uDE18\uDE36\uDE37\uDE3B-\uDE3E\uDE40-\uDE5F\uDE7D-\uDE7F\uDE9D-\uDEBF\uDEC8\uDEE7-\uDEFF\uDF36-\uDF3F\uDF56-\uDF5F\uDF73-\uDF7F\uDF92-\uDFFF]|\uD803[\uDC49-\uDC7F\uDCB3-\uDCBF\uDCF3-\uDCFF\uDD28-\uDD2F\uDD3A-\uDE7F\uDEAA\uDEAD-\uDEAF\uDEB2-\uDEFF\uDF1D-\uDF26\uDF28-\uDF2F\uDF51-\uDFAF\uDFC5-\uDFDF\uDFF7-\uDFFF]|\uD804[\uDC47-\uDC65\uDC70-\uDC7E\uDCBB-\uDCCF\uDCE9-\uDCEF\uDCFA-\uDCFF\uDD35\uDD40-\uDD43\uDD48-\uDD4F\uDD74\uDD75\uDD77-\uDD7F\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDFF\uDE12\uDE38-\uDE3D\uDE3F-\uDE7F\uDE87\uDE89\uDE8E\uDE9E\uDEA9-\uDEAF\uDEEB-\uDEEF\uDEFA-\uDEFF\uDF04\uDF0D\uDF0E\uDF11\uDF12\uDF29\uDF31\uDF34\uDF3A\uDF45\uDF46\uDF49\uDF4A\uDF4E\uDF4F\uDF51-\uDF56\uDF58-\uDF5C\uDF64\uDF65\uDF6D-\uDF6F\uDF75-\uDFFF]|\uD805[\uDC4B-\uDC4F\uDC5A-\uDC5D\uDC62-\uDC7F\uDCC6\uDCC8-\uDCCF\uDCDA-\uDD7F\uDDB6\uDDB7\uDDC1-\uDDD7\uDDDE-\uDDFF\uDE41-\uDE43\uDE45-\uDE4F\uDE5A-\uDE7F\uDEB9-\uDEBF\uDECA-\uDEFF\uDF1B\uDF1C\uDF2C-\uDF2F\uDF3A-\uDFFF]|\uD806[\uDC3B-\uDC9F\uDCEA-\uDCFE\uDD07\uDD08\uDD0A\uDD0B\uDD14\uDD17\uDD36\uDD39\uDD3A\uDD44-\uDD4F\uDD5A-\uDD9F\uDDA8\uDDA9\uDDD8\uDDD9\uDDE2\uDDE5-\uDDFF\uDE3F-\uDE46\uDE48-\uDE4F\uDE9A-\uDE9C\uDE9E-\uDEBF\uDEF9-\uDFFF]|\uD807[\uDC09\uDC37\uDC41-\uDC4F\uDC5A-\uDC71\uDC90\uDC91\uDCA8\uDCB7-\uDCFF\uDD07\uDD0A\uDD37-\uDD39\uDD3B\uDD3E\uDD48-\uDD4F\uDD5A-\uDD5F\uDD66\uDD69\uDD8F\uDD92\uDD99-\uDD9F\uDDAA-\uDEDF\uDEF7-\uDFAF\uDFB1-\uDFFF]|\uD808[\uDF9A-\uDFFF]|\uD809[\uDC6F-\uDC7F\uDD44-\uDFFF]|[\uD80A\uD80B\uD80E-\uD810\uD812-\uD819\uD824-\uD82B\uD82D\uD82E\uD830-\uD833\uD837\uD839\uD83D\uD83F\uD87B-\uD87D\uD87F\uD885-\uDB3F\uDB41-\uDBFF][\uDC00-\uDFFF]|\uD80D[\uDC2F-\uDFFF]|\uD811[\uDE47-\uDFFF]|\uD81A[\uDE39-\uDE3F\uDE5F\uDE6A-\uDECF\uDEEE\uDEEF\uDEF5-\uDEFF\uDF37-\uDF3F\uDF44-\uDF4F\uDF5A-\uDF62\uDF78-\uDF7C\uDF90-\uDFFF]|\uD81B[\uDC00-\uDE3F\uDE80-\uDEFF\uDF4B-\uDF4E\uDF88-\uDF8E\uDFA0-\uDFDF\uDFE2\uDFE5-\uDFEF\uDFF2-\uDFFF]|\uD821[\uDFF8-\uDFFF]|\uD823[\uDCD6-\uDCFF\uDD09-\uDFFF]|\uD82C[\uDD1F-\uDD4F\uDD53-\uDD63\uDD68-\uDD6F\uDEFC-\uDFFF]|\uD82F[\uDC6B-\uDC6F\uDC7D-\uDC7F\uDC89-\uDC8F\uDC9A-\uDC9C\uDC9F-\uDFFF]|\uD834[\uDC00-\uDD64\uDD6A-\uDD6C\uDD73-\uDD7A\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDE41\uDE45-\uDFFF]|\uD835[\uDC55\uDC9D\uDCA0\uDCA1\uDCA3\uDCA4\uDCA7\uDCA8\uDCAD\uDCBA\uDCBC\uDCC4\uDD06\uDD0B\uDD0C\uDD15\uDD1D\uDD3A\uDD3F\uDD45\uDD47-\uDD49\uDD51\uDEA6\uDEA7\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3\uDFCC\uDFCD]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85-\uDE9A\uDEA0\uDEB0-\uDFFF]|\uD838[\uDC07\uDC19\uDC1A\uDC22\uDC25\uDC2B-\uDCFF\uDD2D-\uDD2F\uDD3E\uDD3F\uDD4A-\uDD4D\uDD4F-\uDEBF\uDEFA-\uDFFF]|\uD83A[\uDCC5-\uDCCF\uDCD7-\uDCFF\uDD4C-\uDD4F\uDD5A-\uDFFF]|\uD83B[\uDC00-\uDDFF\uDE04\uDE20\uDE23\uDE25\uDE26\uDE28\uDE33\uDE38\uDE3A\uDE3C-\uDE41\uDE43-\uDE46\uDE48\uDE4A\uDE4C\uDE50\uDE53\uDE55\uDE56\uDE58\uDE5A\uDE5C\uDE5E\uDE60\uDE63\uDE65\uDE66\uDE6B\uDE73\uDE78\uDE7D\uDE7F\uDE8A\uDE9C-\uDEA0\uDEA4\uDEAA\uDEBC-\uDFFF]|\uD83C[\uDC00-\uDD2F\uDD4A-\uDD4F\uDD6A-\uDD6F\uDD8A-\uDFFF]|\uD83E[\uDC00-\uDFEF\uDFFA-\uDFFF]|\uD869[\uDEDE-\uDEFF]|\uD86D[\uDF35-\uDF3F]|\uD86E[\uDC1E\uDC1F]|\uD873[\uDEA2-\uDEAF]|\uD87A[\uDFE1-\uDFFF]|\uD87E[\uDE1E-\uDFFF]|\uD884[\uDF4B-\uDFFF]|\uDB40[\uDC00-\uDCFF\uDDF0-\uDFFF]/g;

function slug(value) {
  return value.toLowerCase().replace(SLUG_STRIP_RE, "").replace(/ /g, "-");
}

// Mirrors GithubSlugger: repeated identical headings in one file get -1, -2, ... suffixes.
function slugsForHeadings(headings) {
  const occurrences = new Map();
  const slugs = [];
  for (const h of headings) {
    const base = slug(h);
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    slugs.push(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

function headingsOf(text) {
  const headings = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) headings.push(m[2].trim());
  }
  return headings;
}

function anchorsOf(path) {
  const text = readFileSync(path, "utf8");
  return new Set(slugsForHeadings(headingsOf(text)));
}

const anchorCache = new Map();
function anchorsFor(path) {
  if (!anchorCache.has(path)) anchorCache.set(path, anchorsOf(path));
  return anchorCache.get(path);
}

// Blank out fenced code blocks (same fence-tracking rule as headingsOf) so a markdown link
// *inside* a fence is never extracted. GitHub renders such a link as literal text, not a link --
// counting it as "checked" would let a broken construct read as verified.
function stripFences(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    out.push(inFence ? "" : line);
  }
  return out.join("\n");
}

// [label](target) -- ignore image links and autolinks.
const LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g;

function extractLinks(text) {
  const links = [];
  let m;
  LINK_RE.lastIndex = 0;
  const stripped = stripFences(text);
  while ((m = LINK_RE.exec(stripped)) !== null) {
    links.push(m[1]);
  }
  return links;
}

function walkMarkdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (EXCLUDED_DIRS.has(full)) continue;
    if (statSync(full).isDirectory()) {
      out.push(...walkMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function targetsDocsDev(absPath) {
  const rel = relative(DOCS_DEV_DIR, absPath);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep + "..");
}

// Resolve a link's target to an absolute local file path, or null if it's genuinely out of
// scope for this checker (external site, a GitHub blob URL for a different repo/path, or a
// Documenter `@ref`/`@ref Label` cross-reference -- Documenter resolves those at site-build
// time against its own anchor registry, not against a file on disk).
function resolveTarget(target, fromFile) {
  if (/^@ref(\s|$)/.test(target)) return null;
  const githubMatch = GITHUB_BLOB_RE.exec(target.split("#")[0]);
  if (githubMatch) {
    // Only resolvable if it points at *this* repo's own tree -- we can't (and don't need to)
    // verify a blob URL into an unrelated repo or path.
    const repoRelPath = githubMatch[1];
    return join(REPO_ROOT, repoRelPath);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
    return null; // some other external URL -- out of scope
  }
  const [filePart] = target.split("#");
  return filePart === "" ? fromFile : resolve(dirname(fromFile), filePart);
}

let checked = 0;
const failures = [];

function checkLink(file, target) {
  const anchorPart = target.includes("#") ? target.slice(target.indexOf("#") + 1) : "";
  const targetPath = resolveTarget(target, file);
  if (targetPath === null) return; // out of scope (external, unrelated repo/path)

  checked++;
  try {
    readFileSync(targetPath, "utf8");
  } catch {
    failures.push(`${file}: link target "${target}" -- file does not exist: ${targetPath}`);
    return;
  }

  if (anchorPart) {
    const anchors = anchorsFor(targetPath);
    if (!anchors.has(anchorPart)) {
      failures.push(
        `${file}: link target "${target}" -- anchor "#${anchorPart}" not found in ${targetPath} ` +
        `(known anchors: ${[...anchors].join(", ")})`
      );
    }
  }
}

// Primary files: every file under docs/dev/, every link is in scope.
const primaryFiles = walkMarkdownFiles(DOCS_DEV_DIR);
for (const file of primaryFiles) {
  const text = readFileSync(file, "utf8");
  for (const target of extractLinks(text)) {
    checkLink(file, target);
  }
}

// Secondary files: everything else under docs/**/*.md. Only links that resolve into docs/dev/
// are in scope here -- an unrelated link elsewhere in one of these files is not this checker's
// job.
const primarySet = new Set(primaryFiles);
const secondaryFiles = walkMarkdownFiles(DOCS_ROOT).filter((f) => !primarySet.has(f));
let secondaryChecked = 0;
for (const file of secondaryFiles) {
  const text = readFileSync(file, "utf8");
  for (const target of extractLinks(text)) {
    const targetPath = resolveTarget(target, file);
    if (targetPath === null || !targetsDocsDev(resolve(targetPath))) continue;
    const before = checked;
    checkLink(file, target);
    if (checked > before) secondaryChecked++;
  }
}

if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} broken link(s) out of ${checked} checked\n`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}

console.log(
  `OK: ${checked} links checked, all resolve ` +
  `(${checked - secondaryChecked} originating in docs/dev/**/*.md, ` +
  `${secondaryChecked} pointing in from ${secondaryFiles.length} other docs/**/*.md files).`
);
