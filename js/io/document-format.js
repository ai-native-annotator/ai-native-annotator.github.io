/**
 * On-disk identity for an AI Native Annotator document.
 *
 * Import routing must not be based on the first character of a file. JSON and
 * JSONL are perfectly valid source formats for a custom reader, so only a
 * document carrying this marker is treated as one of our exports. The narrow
 * legacy check keeps files exported by older releases usable without making a
 * generic `{ sentences: [...] }` object look like an annotated document.
 */

export const DOCUMENT_TYPE = 'ai-native-annotator/document';
export const DOCUMENT_SCHEMA_VERSION = 1;

export class AnnotatorDocumentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnnotatorDocumentError';
    this.code = code;
  }
}

/** Add the stable format marker to an object being exported. */
export function markAnnotatorDocument(doc) {
  return {
    ...doc,
    documentType: DOCUMENT_TYPE,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
  };
}

/**
 * Parse `text` only when it is an annotator document.
 *
 * `null` means "some other input" and lets the configured reader see the
 * original bytes. A marked-but-invalid document throws: silently treating a
 * damaged export as raw text would hide data loss.
 */
export function parseAnnotatorDocument(text) {
  let value;
  try {
    value = JSON.parse(String(text ?? '').trim());
  } catch {
    return null;
  }

  if (value?.documentType === DOCUMENT_TYPE) {
    if (value.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
      throw new AnnotatorDocumentError(
        'UNSUPPORTED_SCHEMA_VERSION',
        `Unsupported annotator document schema version: ${String(value.schemaVersion)}`,
      );
    }
    assertSentences(value);
    return value;
  }

  if (!isLegacyAnnotatorDocument(value)) return null;
  assertSentences(value);
  return value;
}

/**
 * Old exports had no explicit type marker. They did, however, identify the
 * annotation method and carry annotation work or export metadata. Requiring
 * both keeps backwards compatibility without hijacking ordinary JSON APIs
 * whose payload happens to contain a `sentences` property.
 */
export function isLegacyAnnotatorDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.id !== 'string' || typeof value.format !== 'string') return false;
  if (!Array.isArray(value.sentences)) return false;

  const hasExportMetadata =
    typeof value.exportedAt === 'string' ||
    Array.isArray(value.humanEdits) ||
    Array.isArray(value.skillProposals);
  const hasAnnotationWork = value.sentences.some((sentence) => {
    if (!sentence || typeof sentence !== 'object') return false;
    return ['tree', 'passes', 'annotation', 'graph', 'docAnnotation', '_work'].some((key) =>
      Object.prototype.hasOwnProperty.call(sentence, key),
    );
  });
  return hasExportMetadata || hasAnnotationWork;
}

function assertSentences(value) {
  if (!Array.isArray(value.sentences)) {
    throw new AnnotatorDocumentError(
      'INVALID_ANNOTATOR_DOCUMENT',
      'The annotator document has no `sentences` array',
    );
  }
  for (const [index, sentence] of value.sentences.entries()) {
    if (
      !sentence ||
      typeof sentence !== 'object' ||
      Array.isArray(sentence) ||
      typeof sentence.text !== 'string'
    ) {
      throw new AnnotatorDocumentError(
        'INVALID_ANNOTATOR_DOCUMENT',
        `Sentence ${index + 1} must be an object with a text string`,
      );
    }
  }
}
