/* OTHERS */

//this is inside nested query
var shouldMatchLemmaAndText = (word, filters, speaker) => {
    return {
        bool: {
            should: [
                {match_phrase: {"sentences.translations.words.lemma": word}},
                {match_phrase: {"sentences.translations.text": word}}
            ],
            minimum_should_match: 1,
            filter: filters
        }
    }
}

const cleanQuery = (obj) => {
    if (Array.isArray(obj)) {
        return obj
            .map(cleanQuery) // Recursively apply to each item in the array
            .filter(value => value !== null && value !== undefined); // Remove null and undefined values from the array
    } else if (obj !== null && typeof obj === 'object') {
        // Create a new object with non-null values
        return Object.entries(obj)
            .reduce((acc, [key, value]) => {
                const cleanedValue = cleanQuery(value); // Recursively clean each property
                if (cleanedValue !== null && cleanedValue !== undefined) {
                    acc[key] = cleanedValue; // Only add non-null, non-undefined values
                }
                return acc;
            }, {});
    }
    return obj; // Return the value if it's not an array or object
}


/* PARSERS */

/**
 * Tokenizes the words
 * @param {string} query
 * @returns {string[][]} - The tokenized words
 */
const tokenizeQuery = (query) => {
    const orQueries = query.split("OR");

    //extract words in quotes as 1 string, split the rest of the words on spaces (ignore empty strings)
    return orQueries.map(orQuery => {
        const wordsInQuotes = orQuery.match(/"([^"]+)"/g)?.map(word => word.replace(/"/g, ''));
        const wordsWithoutQuotes = orQuery.replace(/"([^"]+)"/g, '').split(" ").filter(word => word !== "");
        return [...(wordsInQuotes || []), ...(wordsWithoutQuotes || [])];
    });
}

const parseSpeaker = (speaker_list) => {
    if (!speaker_list) return null;

    // use the last surname of the speaker since there is no way to know which is the first name and which is the surname
    return speaker_list.split(",").map(speaker => speaker.replace(/[^a-zA-ZäöüßÄÖÜčšžČŠŽ. 0-9\-]/g, "").split(" ").at(-1))
};

const parsePlace = (place_list) => {
    if (!place_list) return null;

    // get lang and name from pattern {lang:name}
    const place_names_str = place_list.match(/{([^}]+)}/g)?.map(place => place.replace(/[{}]/g, '')) || []
    return place_names_str.map(place => {
        const split = place.split(":")
        return {
            lang: split[0],
            name: split[1] || ""
        }
    })
};

const parseSort = (sort) => {
    switch (sort) {
        case "date_asc":
            return [{"date": {"order": "asc"}}];
        case "date_desc":
            return [{"date": {"order": "desc"}}];
        default:
            return [{"_score": {"order": "desc"}}, {"date": {"order": "asc"}}];
    }
}

const parseSearchAfterParams = (sort, searchAfterScore, searchAfterDate, searchAfterIndex) => {
    switch (sort) {
        case "date_asc":
            return [searchAfterDate, searchAfterIndex]
        case "date_desc":
            return [searchAfterDate, searchAfterIndex]
        default:
            return [searchAfterScore, searchAfterDate, searchAfterIndex]
    }
}

/* FORMATTERS */

const formatDate = (date, format) => {
    let dd = date.getDate();
    let MM = date.getMonth() + 1;
    const yyyy = date.getFullYear();

    if (dd < 10) dd = '0' + dd;
    if (MM < 10) MM = '0' + MM;

    return format.replace('dd', dd).replace('MM', MM).replace('yyyy', yyyy);
}

// joins words so that punctuation is not separated from the word
const joinWords = (words) => {
    let joined = [];
    let charactersLeft = '([{»„‘\'\"“';
    let charactersRight = '.,:;?!)]}«“’\'\"”';
    let word = '';
    for (let i = 0; i < words.length; i++) {
        word = words[i].text;
        if (i + 1 < words.length && (charactersLeft.includes(word.trim()) || charactersRight.includes(words[i + 1].text.trim()))) {
            joined.push(buildHtmlElement(`<span id='${words[i].id}'>`, word.trim(), "", "</span>"));
            joined.push(buildHtmlElement(`<span id='${words[i + 1].id}'>`, words[i + 1].text.trim(), "", "</span>"));
            i++;
        } else {
            joined.push(buildHtmlElement(`<span id='${words[i].id}'>`, word.trim(), "", "</span>"));
        }
        joined.push(' ');
    }
    return joined.join('');
}

/* MESSAGE HELPER FUNCTIONS */

const getNoTitleMessage = (lang) => {
    switch (lang) {
        case "sl":
            return "Zapisnik ne vsebuje naslova v slovenščini";
        case "de":
            return "Das Protokoll enthält keinen Titel in deutscher Sprache";
        case "hr":
            return "Zapisnik ne sadrži naslov na hrvatskom jeziku";
        case "sr":
            return "Записник не садржи наслов на српском језику";
        default:
            return "The minutes do not contain a title in English";
    }
}

const getNoAgendaMessage = (lang) => {
    switch (lang) {
        case "sl":
            return "Zapisnik ne vsebuje dnevnega reda";
        case "de":
            return "Das Protokoll enthält nicht die Tagesordnung";
        case "hr":
            return "Zapisnik ne sadrži dnevni red";
        case "sr":
            return "Записник не садржи дневни ред";
        default:
            return "The minutes do not contain an agenda";
    }
}

const getNoSpeakerMessage = (lang) => {
    switch (lang) {
        case "sl":
            return "Neimenovani govorec";
        case "de":
            return "Ungenannter Sprecher";
        case "hr":
            return "Nepoznati govornik";
        case "sr":
            return "Непознати говорник";
        default:
            return "Unknown speaker";
    }
}

const getAgendaTitle = (lang) => {
    switch (lang) {
        case "sl":
            return "Dnevni red";
        case "de":
            return "Tagesordnung";
        case "hr":
            return "Dnevni red";
        case "sr":
            return "Дневни ред";
        default:
            return "Agenda";
    }
}

/* (QUERY) BUILDERS */

const buildHtmlElement = (start, text, alternativeText, end) => {
    let htmlElement = start;
    htmlElement += text ?? alternativeText;
    htmlElement += end;
    return htmlElement;
}

/**
 * Builds the query body for searching meetings based on words and place names.
 *
 * @param {string[]} words - The words to search for in the meetings.
 * @param {Object[]} placeNames - The place names to search for in the meetings.
 * @returns {Object|null} - The query body for searching meetings or null if there are no word queries or place names.
 */
const buildQueryBody = (words, placeNames, speaker, filters) => {
    var shouldQueries = [];
    const tokenizedQuery = tokenizeQuery(words);

    const queryFilters = [
        {terms: {"sentences.translations.lang": filters.languages.split(",")}},
    ]

    if (speaker) queryFilters.push({
        bool: {
            should: speaker.map(speaker => {
                return {match: {"sentences.translations.speaker": speaker}}
            }),
            minimum_should_match: 1
        }
    })


    // each list inside tokenized query contains a list of words and phrases
    // valid meeting has a least one valid outer list, of which all elements are present
    // element is present if meeting has the actual word as it is provided or a lemma matches the words
    shouldQueries = tokenizedQuery.map(wordsAndPhrases => {
        // if there are no words or phrases in the list, return null
        if (!wordsAndPhrases || wordsAndPhrases.length === 0) return null;

        // if there is only one word or phrase in the list, return a match_phrase query for text and lemmas
        if (wordsAndPhrases.length === 1) {
            return shouldMatchLemmaAndText(wordsAndPhrases[0], queryFilters)
        }

        // if there are multiple words or phrases in the list, return a bool query with should match_phrase queries for text and lemmas
        return {
            bool: {
                must: wordsAndPhrases.map(word => {
                    return shouldMatchLemmaAndText(word, queryFilters, speaker)
                })
            },
        }
    }).filter(query => query != null)

    // console.log(filters.languages)

    var placeNamesQuery = placeNames ? [{
        bool: {
            should: placeNames.map(place => {
                return {match_phrase: {"sentences.translations.words.lemma": place.name}}
            }),
            minimum_should_match: 1,
            filter: queryFilters
        }
    }] : []

    // if there are no word queries, place names or speaker, return null
    if (shouldQueries.length < 1 && placeNamesQuery.length < 1 && !speaker) return null;

    // if there is only speaker, return all translations where speaker speaks, language is correct and is original
    if (shouldQueries.length < 1 && placeNamesQuery.length < 1 && speaker) {
        // create speaker query
        let speakerQuery = {
            bool: {
                must: [
                    {terms: {"sentences.translations.lang": filters.languages.split(",")}},
                    {
                        bool: {
                            should: speaker.map(speaker => {
                                return {match: {"sentences.translations.speaker": speaker}}
                            }),
                            minimum_should_match: 1
                        }
                    }
                ]
            }
        }

        // add original filter if there are multiple languages
        if (filters.languages.split(",").length > 1) speakerQuery.bool.must.push({match: {"sentences.translations.original": 1}})

        // return nested query
        return {
            nested: {
                path: "sentences.translations",
                query: speakerQuery,
                inner_hits: {
                    size: 10,
                    highlight: {
                        fields: {
                            "sentences.translations.text": {},
                            "sentences.translations.words.lemma": {},
                        }
                    }
                }
            }
        }
    }

    // else return all translations which match at least one word query and place name query
    let bodyQuery = {
        nested: {
            path: "sentences.translations",
            query: {
                bool: {
                    must: []
                }
            },
            inner_hits: {
                size: 10,
                highlight: {
                    fields: {
                        "sentences.translations.text": {},
                        "sentences.translations.words.lemma": {},
                    }
                }
            }
        }
    }

    if (shouldQueries.length > 0) bodyQuery.nested.query.bool.must.push({
        bool: {
            should: shouldQueries,
            minimum_should_match: 1
        }
    })
    if (placeNamesQuery.length > 0) bodyQuery.nested.query.bool.must.push(...placeNamesQuery)

    // must match place name query if there are place names and must match all word queries
    // return null if there are no word queries or place names
    return bodyQuery
}


/**
 * Returns the query body for searching words in meeting with given id and other filters or an empty object if the meeting id or words are not provided.
 *
 * @param {string} meetingId - The id of the meeting.
 * @param {string[]} words - The words to search for in the meeting.
 * @param {string|undefined} speaker - The speaker who spoke the words (optional).
 * @param {string|undefined} lang - The language of the words (optional), if undefined, defaults to original language.
 * @param {boolean} looseSearch - Whether to allow some fuzziness in the search.
 * @returns {{bool: {filter: [{term: {meeting_id}},{term: {speaker}}], should: *[], minimum_should_match: number}} | {}} - The query body for searching words in the meeting.
 */
const wordsSearchQueryBuilder = (meetingId, words, speaker, lang, looseSearch) => {
    if (!meetingId || !words || words.length === 0)
        return {};

    // Single word is a match if it matches either lemma or text, we also allow some fuzziness
    let wordsFilter = words.map(word => {
        return {
            multi_match: {
                query: word,
                type: "best_fields",
                fields: ["text", "lemma"],
                minimum_should_match: 1,
                fuzziness: (looseSearch) ? "AUTO:5,10" : "0"
            }
        }
    });

    // Build the query body
    return {
        bool: {
            filter: [
                {
                    term: {
                        "meeting_id": meetingId
                    }
                },
                ...(lang ? [{term: {"lang": lang}}] : [])
            ],
            must: [
                ...(speaker ? [{
                    match: {
                        "speaker": {
                            query: speaker,
                            fuzziness: "2",
                            operator: "and"
                        }
                    }
                }] : []),
                {
                    bool: {
                        should: wordsFilter,
                        minimum_should_match: 1
                    }
                }
            ]
        }
    };
}


/**
 * Builds the query body for searching sentences with given ids in meeting with given id.
 *
 * @param meetingId - The id of the meeting.
 * @param sentencesIds - The ids of the sentences to search for in the meeting.
 * @returns {{bool: {filter: [{term: {meeting_id}},{terms: {sentence_id}}]}}}
 */
const sentencesCoordinatesQueryBuilder = (meetingId, sentencesIds) => {
    // TODO: figure something out for the case when meetingId is not provided
    if (!meetingId)
        throw new Error("Meeting id is required for building the query body");

    if (!sentencesIds)
        throw new Error("Array of sentences ids is required for building the query body");

    // Build the query body
    return {
        bool: {
            filter: [
                {
                    term: {
                        "meeting_id": meetingId
                    }
                },
                {
                    terms: {
                        "sentence_id": sentencesIds
                    }
                }
            ]
        }
    };
}

/**
 * Returns the query body for searching phrases (multiple consecutive words) in meetings with given id and other filters or an empty object if the meeting id or phrases are not provided.
 *
 * @param {string} meetingId - The id of the meeting.
 * @param {string[][]} phrases - The phrases to search for in the meeting (phrase is an array of words).
 * @param {string|undefined} speaker - The speaker who spoke the phrases (optional).
 * @param {string|undefined} lang - The language of the phrases (optional), if undefined, defaults to original language.
 * @param {boolean} looseSearch - Whether to allow some fuzziness in the search.
 * @returns {{bool: {filter: [{term: {meeting_id}},{term: {speaker}}], should: *[], minimum_should_match: number}} | {}} - The query body for searching phrases in the meeting.
 */
const phrasesSearchQueryBuilder = (meetingId, phrases, speaker, lang, looseSearch) => {

    if (!meetingId || !phrases || phrases.length === 0)
        return {};


    const phrasesFilters = phrases.map(phrase => {
        // All words in the phrase must be present in the sentence one after the other in the given order
        return {
            span_near: {
                // We add clauses for each word in the phrase, we allow some fuzziness
                clauses: phrase.map(word => {
                    return {
                        span_multi: {
                            match: {
                                fuzzy: {
                                    "translations.text": {
                                        value: word,
                                        fuzziness: (looseSearch) ? "AUTO:5,10" : "0"
                                    }
                                }
                            }
                        }
                    }
                }),
                slop: 0,
                in_order: true,
            },
        }
    });

    let queryBody = {
        bool: {
            filter: [
                {
                    term: {
                        "meeting_id": meetingId
                    }
                }
            ],
            must: [
                ...(speaker ? [{
                    match: {
                        "speaker": {
                            query: speaker,
                            fuzziness: "2",
                        }
                    }
                }] : []),
                {
                    nested: {
                        path: "translations",
                        query: {
                            bool: {
                                should: phrasesFilters,
                                minimum_should_match: 1
                            }
                        },
                        // This tells us in which translation the phrase was found (could be in multiple translations)
                        inner_hits: {
                            name: "matched_translation",
                            // Highlight the matched words in the sentence
                            highlight: {
                                number_of_fragments: 0,
                                fields: {
                                    "translations.text": {}
                                }
                            },
                            // Sort the inner hits by the original translation (in case there are matches in multiple translations, we want to show the original one first)
                            sort: [
                                {
                                    "translations.original": {
                                        order: "desc"
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        }
    };

    // Remove null and undefined values from the query body
    return queryBody;
}

/**
 * Extracts the indexes of the words wrapped in <em> tags in the text.
 *
 * @param {string} text - The text that contains the words wrapped in <em> tags
 * @returns {number[]} - The indexes of the words wrapped in <em> tags in the text
 */
const getEmTagIndexes = (text) => {

    // Remove all non-alphanumeric characters except <em> and </em> tags
    let sanitizedText = text.replace(/(?![<\/?em>])[^\p{L}\p{N}\s]/gu, "");

    const emTagPattern = /<em>.*?<\/em>/gu; // Pattern to match <em> tags
    const punctuationRegex = /[\p{P}]/gu; // Regex to match punctuation characters except .
    let indexes = [];
    let wordIndex = -1;
    let match;

    while ((match = emTagPattern.exec(sanitizedText)) !== null) {

        // Count the words before the match and add it to the indexes
        let wordsBefore = sanitizedText.substring(0, match.index).split(/\s+/).filter(word => word.length > 0);
        wordsBefore = wordsBefore.filter(word => !word.match(punctuationRegex));

        wordIndex += Math.max(0, wordsBefore.length) + 1;
        indexes.push(wordIndex);

        // Remove the matched part from the text to continue search and reset the regex index
        sanitizedText = sanitizedText.slice(match.index + match[0].length);
        emTagPattern.lastIndex = 0;
    }

    return indexes;
}


const groupCoordinates = (coordinates) => {
    return coordinates.reduce((acc, coord) => {
        // Find or create an entry for the current page
        let pageGroup = acc.find(item => item.page === coord.page);

        if (!pageGroup) {
            pageGroup = {page: coord.page, coordinates: []};
            acc.push(pageGroup);
        }

        // Find if there's an existing coordinate with the same y0 value
        const existing = pageGroup.coordinates.find(
            c => c.y0 === coord.y0
        );

        if (existing) {
            // Update x0 to be the minimum, and x1 to be the maximum
            existing.x0 = Math.min(existing.x0, coord.x0);
            existing.x1 = Math.max(existing.x1, coord.x1);
        } else {
            // If no match is found for y0, add the new coordinate to the coordinates array
            pageGroup.coordinates.push({x0: coord.x0, y0: coord.y0, x1: coord.x1, y1: coord.y1});
        }

        return acc;
    }, []);
}

module.exports = {
    shouldMatchLemmaAndText,
    tokenizeQuery,
    parseSpeaker,
    parsePlace,
    parseSort,
    parseSearchAfterParams,
    formatDate,
    joinWords,
    getNoTitleMessage,
    getNoAgendaMessage,
    getNoSpeakerMessage,
    getAgendaTitle,
    buildHtmlElement,
    buildQueryBody,
    wordsSearchQueryBuilder,
    sentencesCoordinatesQueryBuilder,
    phrasesSearchQueryBuilder,
    getEmTagIndexes,
    groupCoordinates
}