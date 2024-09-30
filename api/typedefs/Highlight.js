/**
 * @typedef {Object} Coordinate
 * @property {number} page The page number where the phrase is located.
 * @property {number} x0 The x-coordinate of the top-left corner of the phrase.
 * @property {number} y0 The y-coordinate of the top-left corner of the phrase.
 * @property {number} x1 The x-coordinate of the bottom-right corner of the phrase.
 * @property {number} y1 The y-coordinate of the bottom-right corner of the phrase.
 */


/**
 * @typedef {Object} Highlight
 * @property {ids} string[] - IDs of the words that need to be highlighted
 * @property {coordinates} Rect[] - Page no. and coordinates of the words (on the PDF doc.) that need to be highlighted
 */