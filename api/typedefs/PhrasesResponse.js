/**
 * @typedef {Object} Coordinate
 * @property {number} page The page number where the phrase is located.
 * @property {number} x0 The x-coordinate of the top-left corner of the phrase.
 * @property {number} y0 The y-coordinate of the top-left corner of the phrase.
 * @property {number} x1 The x-coordinate of the bottom-right corner of the phrase.
 * @property {number} y1 The y-coordinate of the bottom-right corner of the phrase.
 */

/**
 * @typedef {Object} Translation
 * @property {string} text The translated text.
 * @property {string} lang The language code of the translation.
 * @property {number} original Whether the translation is the original text (1) or not.
 */

/**
 * @typedef {Object} Source
 * @property {string} meeting_id The ID of the meeting.
 * @property {string} sentence_id The ID of the sentence.
 * @property {string} segment_id The ID of the segment.
 * @property {string} speaker The speaker who said the phrase.
 * @property {Coordinate[]} coordinates The list of phrase coordinates.
 * @property {Translation[]} translations The list of translations for the phrase.
 */

/**
 * @typedef {Object} HighlightedWords
 * @property {string[]} translations_text Highlighted parts of the translations text.
 */

/**
 * @typedef {Object} InnerHitSource
 * @property {string} text The nested translated text.
 * @property {string} lang The language of the translation.
 * @property {number} original Whether it's the original text (1) or not.
 */

/**
 * @typedef {Object} InnerHit
 * @property {string} _index The index name.
 * @property {string} _id The document ID.
 * @property {Object} _nested Information about the nested field.
 * @property {number} _score The score of the inner hit.
 * @property {InnerHitSource} _source The source object for the inner hit.
 */

/**
 * @typedef {Object} InnerHits
 * @property {Object} total The total number of inner hits.
 * @property {number} max_score The maximum score of the inner hits.
 * @property {InnerHit[]} hits The list of inner hits.
 */

/**
 * @typedef {Object} MatchedTranslation
 * @property {InnerHits} hits The inner hits for matched translations.
 */

/**
 * @typedef {Object} Hit
 * @property {string} _index The index name.
 * @property {string} _id The document ID.
 * @property {number} _score The score of the hit.
 * @property {Source} _source The source object containing the phrase details.
 * @property {HighlightedWords} highlight The highlighted parts of the text.
 * @property {Object} inner_hits The inner hits information.
 * @property {MatchedTranslation} matched_translation Inner hits for matched translations.
 */

/**
 * @typedef {Object} Shards
 * @property {number} total The total number of shards.
 * @property {number} successful The number of successful shards.
 * @property {number} skipped The number of skipped shards.
 * @property {number} failed The number of failed shards.
 */

/**
 * @typedef {Object} Total
 * @property {number} value The total number of hits.
 * @property {string} relation The relation of the total value (e.g., 'eq').
 */

/**
 * @typedef {Object} Hits
 * @property {Total} total The total hits information.
 * @property {number} max_score The maximum score of the hits.
 * @property {Hit[]} hits The list of individual hits.
 */

/**
 * @typedef {Object} PhrasesResponse
 * @property {number} took The time Elasticsearch took to process the request.
 * @property {boolean} timed_out Whether the request timed out.
 * @property {Shards} _shards The shard information.
 * @property {Hits} hits The hits object containing the results.
 */