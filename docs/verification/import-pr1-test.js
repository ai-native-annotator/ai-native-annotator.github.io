/**
 * PR1 import correctness guard.
 *
 * Covers the routing boundary that is easy to regress: JSON is a source
 * format unless it explicitly identifies itself as an annotator export, a
 * configured reader either succeeds or rejects (never silently falls back),
 * and only the exact source/sample pair that passed a dry-run may be saved.
 *
 * Run: npm run test:browser -- import-pr1-test.js
 */
const { launchBrowser } = require('./_browser');

const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0,
  fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);

  console.log('\n--- 1. annotator exports have an explicit identity ---');
  const identity = await page.evaluate(async () => {
    const format = await import('./js/io/document-format.js');
    const sources = await import('./js/io/sources.js');
    const exported = sources.exportDocument();
    const ordinary = { id: 'api', sentences: [{ text: 'not our document' }] };
    const legacy = {
      id: 'old-export',
      format: 'umr',
      sentences: [{ text: 'legacy', tree: [] }],
    };
    let versionError = null;
    let invalidError = null;
    try {
      format.parseAnnotatorDocument(
        JSON.stringify({
          documentType: format.DOCUMENT_TYPE,
          schemaVersion: 999,
          sentences: [],
        }),
      );
    } catch (error) {
      versionError = { name: error.name, code: error.code };
    }
    try {
      format.parseAnnotatorDocument(
        JSON.stringify({
          documentType: format.DOCUMENT_TYPE,
          schemaVersion: format.DOCUMENT_SCHEMA_VERSION,
          sentences: [{ notText: true }],
        }),
      );
    } catch (error) {
      invalidError = { name: error.name, code: error.code };
    }
    return {
      marker: exported?.documentType,
      version: exported?.schemaVersion,
      ordinary: format.parseAnnotatorDocument(JSON.stringify(ordinary)),
      legacy: format.parseAnnotatorDocument(JSON.stringify(legacy))?.id,
      versionError,
      invalidError,
    };
  });
  check(
    'new exports carry the stable document type',
    identity.marker === 'ai-native-annotator/document',
    identity.marker,
  );
  check('new exports carry schema version 1', identity.version === 1, String(identity.version));
  check(
    'ordinary JSON with `sentences` is not mistaken for our export',
    identity.ordinary === null,
  );
  check('legacy annotated exports still open', identity.legacy === 'old-export', identity.legacy);
  check(
    'unknown marked versions fail explicitly',
    identity.versionError?.code === 'UNSUPPORTED_SCHEMA_VERSION',
    JSON.stringify(identity.versionError),
  );
  check(
    'malformed marked documents fail before normalization',
    identity.invalidError?.code === 'INVALID_ANNOTATOR_DOCUMENT',
    JSON.stringify(identity.invalidError),
  );

  console.log('\n--- 2. JSON and JSONL reach the configured reader ---');
  const routed = await page.evaluate(async () => {
    const importers = await import('./js/core/importers.js');
    const sources = await import('./js/io/sources.js');

    importers.setImporter(
      'umr',
      `function parse(text) {
      const value = JSON.parse(text);
      return { sentences: value.items.map((item) => ({ text: item.body, sourceId: item.id })) };
    }`,
    );
    const json = await sources.importDocument(
      JSON.stringify({
        id: 'ordinary',
        sentences: [{ text: 'API field, not an export' }],
        items: [{ id: 7, body: 'JSON reached reader' }],
      }),
      'api.json',
    );

    importers.setImporter(
      'umr',
      `function parse(text) {
      return { sentences: text.trim().split('\\n').map((line) => {
        const value = JSON.parse(line); return { text: value.body, sourceId: value.id };
      }) };
    }`,
    );
    const jsonl = await sources.importDocument(
      '{"id":1,"body":"first"}\n{"id":2,"body":"second"}',
      'events.jsonl',
    );
    importers.clearImporter('umr');
    return {
      jsonText: json.sentences[0]?.text,
      jsonKept: json.sentences[0]?.sourceId,
      jsonlTexts: jsonl.sentences.map((sentence) => sentence.text),
      jsonlIds: jsonl.sentences.map((sentence) => sentence.sourceId),
    };
  });
  check(
    'ordinary JSON was parsed by the reader',
    routed.jsonText === 'JSON reached reader' && routed.jsonKept === 7,
    JSON.stringify(routed),
  );
  check(
    'JSONL was parsed by the reader',
    routed.jsonlTexts.join(',') === 'first,second' && routed.jsonlIds.join(',') === '1,2',
    JSON.stringify(routed),
  );

  console.log('\n--- 2b. source and sentence identities are content-derived ---');
  const provenance = await page.evaluate(async () => {
    const sources = await import('./js/io/sources.js');
    const first = sources.parseDocument('same line', 'corpus.txt');
    const reopened = sources.parseDocument('same line', 'renamed.txt');
    const changed = sources.parseDocument('different line', 'corpus.txt');
    return {
      sameSource: first.sourceHash === reopened.sourceHash,
      sameSentence: first.sentences[0].id === reopened.sentences[0].id,
      changedSource: first.sourceHash !== changed.sourceHash,
      changedSentence: first.sentences[0].id !== changed.sentences[0].id,
    };
  });
  check(
    'reopening identical content preserves source and sentence identities',
    provenance.sameSource && provenance.sameSentence,
    JSON.stringify(provenance),
  );
  check(
    'same filename with changed content gets new identities',
    provenance.changedSource && provenance.changedSentence,
    JSON.stringify(provenance),
  );

  console.log('\n--- 3. reader failure is typed and never falls back ---');
  const rejection = await page.evaluate(async () => {
    const importers = await import('./js/core/importers.js');
    const sources = await import('./js/io/sources.js');
    importers.setImporter('umr', 'function parse() { throw new Error("reader exploded"); }');
    try {
      await sources.importDocument('line one\nline two', 'broken.txt');
      return { resolved: true };
    } catch (error) {
      return {
        resolved: false,
        name: error.name,
        code: error.code,
        formatId: error.formatId,
        message: error.message,
      };
    } finally {
      importers.clearImporter('umr');
    }
  });
  check(
    'a broken reader rejected instead of returning fallback sentences',
    rejection.resolved === false &&
      rejection.name === 'ImporterExecutionError' &&
      rejection.code === 'IMPORTER_EXECUTION_FAILED',
    JSON.stringify(rejection),
  );
  check(
    'the underlying error remains visible',
    rejection.message?.includes('reader exploded'),
    rejection.message,
  );

  console.log('\n--- 4. save requires a successful dry-run of the exact draft ---');
  await page.evaluate(async () => {
    const importers = await import('./js/core/importers.js');
    const panel = await import('./js/ui/importer-panel.js');
    importers.clearImporter('umr');
    await panel.openImporterPanel('umr');
  });
  const textareas = await page.$$('.importer-body textarea');
  const sample = textareas[1];
  const code = await page.$('.importer-body .code-box');
  const save = await page.$('[data-importer-action="save"]');
  await sample.fill('one line');
  await save.click();
  const beforeRun = await page.evaluate(async () =>
    Boolean((await import('./js/core/importers.js')).getImporter('umr')),
  );
  check('save before dry-run was refused', !beforeRun);

  const dryRun = await page.$('[data-importer-action="dry-run"]');
  await dryRun.click();
  await page.waitForFunction(() => document.querySelector('.importer-preview .importer-sent'));
  await code.fill((await code.inputValue()) + '\n// edited after verification');
  await save.click();
  const afterEdit = await page.evaluate(async () =>
    Boolean((await import('./js/core/importers.js')).getImporter('umr')),
  );
  check('editing code invalidated the successful dry-run', !afterEdit);

  await dryRun.click();
  await page.waitForFunction(() => document.querySelector('.importer-body .edit-status.ok'));
  await save.click();
  await page.waitForTimeout(300);
  const afterVerifiedSave = await page.evaluate(async () => {
    const importers = await import('./js/core/importers.js');
    const saved = importers.getImporter('umr');
    importers.clearImporter('umr');
    return saved;
  });
  check(
    'the exact successfully tested draft was saved',
    Boolean(afterVerifiedSave?.source?.includes('edited after verification')),
  );

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log(`=== CONSOLE ERRORS: ${errors.length}`);
  errors.forEach((error) => console.log('   ' + error.slice(0, 200)));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch((error) => {
  console.error('FAILED:', error.stack || error.message);
  process.exit(1);
});
