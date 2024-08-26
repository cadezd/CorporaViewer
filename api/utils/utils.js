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
    buildQueryBody
}