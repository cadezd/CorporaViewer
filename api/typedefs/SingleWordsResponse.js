/**
 * @typedef {Object} Coordinate
 * @property {number} page The page number where the word is located.
 * @property {number} x0 The x-coordinate of the top-left corner of the word.
 * @property {number} y0 The y-coordinate of the top-left corner of the word.
 * @property {number} x1 The x-coordinate of the bottom-right corner of the word.
 * @property {number} y1 The y-coordinate of the bottom-right corner of the word.
 */

/**
 * @typedef {Object} Source
 * @property {string} meeting_id The ID of the meeting.
 * @property {string} sentence_id The ID of the sentence.
 * @property {string} segment_id The ID of the segment.
 * @property {string} word_id The ID of the word.
 * @property {string} text The text of the word.
 * @property {string} lemma The lemma form of the word.
 * @property {string} speaker The speaker in the sentence.
 * @property {number} pos The position of the word in the sentence.
 * @property {number} wpos The word position in the segment.
 * @property {Coordinate[]} coordinates The list of word coordinates.
 * @property {string} lang The language code.
 * @property {number} original Indicates if the word is in the original language (1) or not.
 * @property {number} propn Indicates if the word is a proper noun (1) or not.
 */

/**
 * @typedef {Object} Hit
 * @property {string} _index The index name.
 * @property {string} _id The document ID.
 * @property {number} _score The score of the hit.
 * @property {Source} _source The source object containing the word details.
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
 * @typedef {Object} SingleWordsResponse
 * @property {number} took The time Elasticsearch took to process the request.
 * @property {boolean} timed_out Whether the request timed out.
 * @property {Shards} _shards The shard information.
 * @property {Hits} hits The hits object containing the results.
 */