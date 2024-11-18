require('dotenv').config();
const esClient = require('../../services/elasticsearch');
const utils = require('./utils/utils');
const ASCIIFolder = require("fold-to-ascii");
const searchStrategiesSelector = require('./strategies/searchStrategieSelector');

/**
 * Retrieves all meetings based on the provided filters and pagination. Does not use pit.
 * @param {Object} filters - The filters to apply to the meetings.
 * @param {number} page - The page number for pagination.
 * @returns {Promise<Object>} - The result of the getAll operation.
 */
async function getAll(filters, page) {
    var searchFilters = []
    searchFilters.push({range: {"date": {gte: utils.formatDate(new Date(filters.dateFrom), "dd.MM.yyyy")}}})
    searchFilters.push({range: {"date": {lte: utils.formatDate(new Date(filters.dateTo), "dd.MM.yyyy")}}})
    searchFilters.push({terms: {"corpus": filters.corpuses.split(",")}})

    try {
        const response = await esClient.search({
            index: process.env.MEETINGS_INDEX_NAME || 'meetings-index',
            body: {
                _source: ["id", "date", "titles", "agendas"],
                query: {
                    bool: {
                        must: [],
                        filter: searchFilters
                    }
                },
                size: 10,
                from: (page - 1) * 10,
                sort: utils.parseSort(filters.sort)
            }
        });

        let meetingPromises = response.hits.hits.map(async meeting => {
            return {
                id: meeting._source.id,
                date: meeting._source.date,
                titles: meeting._source.titles,
                agendas: meeting._source.agendas,
                sentences: []
            };
        });

        // wait for all promises to resolve
        const meetings = await Promise.all(meetingPromises);

        return {
            meetings: meetings,
            total: response.hits.total.value
        };

    } catch (error) {
        console.error(error);
        return {error: "Internal server error"};
    }
}


// this function will replace search, since its ineficient. search function calls getAllValidMeetings which takes too long, since it has to go through all meetings
// this function will make use of elasticsearch point in time to get meeting data just for the page in the request parameter
const getPage = async (req, res) => {
    // initialize variables
    const words = req.query.words || ""
    const speaker = utils.parseSpeaker(req.query.speaker)
    const placeNames = utils.parsePlace(req.query.place)
    const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        languages: req.query.languages,
        corpuses: req.query.corpuses,
        sort: req.query.sort
    }
    const page = req.params.page
    const pitId = req.query.pitId
    const searchAfterScore = req.query.searchAfterScore
    const searchAfterDate = req.query.searchAfterDate
    const searchAfterIndex = req.query.searchAfterIndex

    // check if all required query parameters are provided
    if (!filters.dateFrom || !filters.dateTo || !filters.languages || !filters.corpuses || !page) {
        res.json({
            error: `Bad request, missing:` +
                `${!filters.dateFrom ? " dateFrom" : ""}` +
                `${!filters.dateTo ? " dateTo" : ""}` +
                `${!filters.languages ? " languages" : ""}` +
                `${!filters.corpuses ? " corpuses" : ""}` +
                `${!page ? " page" : ""}`,
            meetings: [],
            total: 0,
            page: page,
            pitId: null,
            searchAfterScore: null,
            searchAfterDate: null,
            searchAfterIndex: null
        });
        return;
    }

    // check if search has at least one language and corpus selected
    if (filters.languages === "" || filters.corpuses === "") {
        res.json({
            meetings: [],
            total: 0,
            page: page,
            pitId: null,
            searchAfterScore: null,
            searchAfterDate: null,
            searchAfterIndex: null
        });
        return;
    }

    if (!req.query.words && !speaker && !placeNames) {
        const response = await getAll(filters, page)
        return res.json(response);
    }

    // check if page is valid
    if (page < 1) {
        res.status(400).json({error: `Bad request, invalid page`});
        return;
    } else if (page > 1 && (!pitId || (!searchAfterScore && filters.sort === "relevance") || !searchAfterDate)) {
        res.status(400).json({
            error: `Bad request, missing:` +
                `${!pitId ? " pitId" : ""}` +
                `${!searchAfterScore && filters.sort === "relevance" ? " searchAfterScore" : ""}` +
                `${!searchAfterDate ? " searchAfterDate" : ""}`
        });
        return;
    }

    const queryBody = utils.buildQueryBody(words, placeNames, speaker, filters)

    // console.log(JSON.stringify(queryBody, null, 2))

    try {
        // query which is scored by number of translations found in the nested query
        const query = {
            _source: ["id", "date", "titles", "agendas", "corpus"],
            body: {
                query: {
                    function_score: {
                        query: queryBody,
                        score_mode: "sum",
                    }
                }
            },
            size: 10,
            sort: utils.parseSort(filters.sort),
        }

        // close pit if page is 1 and pitId is provided
        if (page == 1 && pitId) {
            esClient.closePointInTime({
                body: {
                    id: pitId
                }
            })
        } else if (page > 1 && searchAfterScore && searchAfterDate) {
            query.body.search_after = utils.parseSearchAfterParams(filters.sort, searchAfterScore, searchAfterDate, searchAfterIndex)
        }

        // open pit if page is 1
        const pit = page == 1 ? await esClient.openPointInTime({
            index: process.env.MEETINGS_INDEX_NAME || 'meetings-index',
            keep_alive: '30m'
        }) : {id: pitId}

        query.pit = pit

        // console.log(JSON.stringify(query, null, 2))

        const response = await esClient.search(query);

        const meetings = response.hits.hits.map(meeting => {
            return {
                id: meeting._source.id,
                date: meeting._source.date,
                titles: meeting._source.titles,
                agendas: meeting._source.agendas,
                corpus: meeting._source.corpus,
                sentences: meeting.inner_hits["sentences.translations"].hits.hits.map(sentence => {
                    return {
                        lang: sentence._source.lang,
                        original: sentence._source.original,
                        text: sentence._source.text,
                        speaker: sentence._source.speaker,
                        words: sentence._source.words,
                        highlights: sentence.highlight
                    }
                }),
                totalSentences: meeting.inner_hits["sentences.translations"].hits.total.value
            };
        })

        res.json({
            meetings: meetings,
            searchAfterScore: response.hits.hits[response.hits.hits.length - 1]?._score ?? null,
            searchAfterDate: response.hits.hits[response.hits.hits.length - 1]?._source.date ?? null,
            searchAfterIndex: response.hits.hits[response.hits.hits.length - 1]?.sort[response.hits.hits[response.hits.hits.length - 1].sort.length - 1] ?? null,
            pitId: pit.id,
            page: page,
            total: response.hits.total.value,
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Internal server error"});
    }
};

/**
 * Retrieves a meeting as text. Sentences are sorted by their IDs and then aggregated into segments, which are sorted by their IDs.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A Promise that resolves when the meeting is retrieved.
 */
const getMeetingAsText = async (req, res) => {
    const meetingId = req.params.meetingId
    const lang = req.query.lang
    const pageLang = lang || req.query.pageLang

    if (meetingId == null || meetingId === "") {
        res.status(400).json({error: "Bad request, missing meetingId"});
        return;
    }

    // get all segments in a meeting
    const meeting = await esClient.search({
        index: process.env.MEETINGS_INDEX_NAME || 'meetings-index',
        _source: ["id", "date", "titles", "agendas", "sentences"],
        body: {
            query: {
                term: {
                    "id": meetingId
                }
            },
            size: 1
        }
    });

    const searchedForMeeting = meeting.hits.hits[0]._source
    const sentences = searchedForMeeting.sentences

    // aggregate sentences into segments
    let segments = sentences.reduce((segments, sentence) => {

        const segment_id = sentence.segment_id.split("seg")[1];

        if (!segments[segment_id]) segments[segment_id] = {sentences: [], speaker: sentence.speaker};

        segments[segment_id].sentences.push(sentence);

        return segments;
    }, {});

    let title = "", agendas = "", content = "", text = "";

    // gets the title in chosen or default language
    title = utils.buildHtmlElement(
        "<h2 class='title-text'>",
        searchedForMeeting.titles.find(title => title.lang === pageLang)?.title,
        utils.getNoTitleMessage(pageLang),
        "</h2>"
    );

    // gets the agendas in chosen or default language
    agendas = utils.buildHtmlElement(
        "<div class='agenda-text'>",
        searchedForMeeting.agendas.find(agenda => agenda.lang === pageLang)?.items.map(item => item.text).join("</div><div class='agenda-text'>"),
        utils.getNoAgendaMessage(pageLang),
        "</div>"
    );

    // gets the content in chosen or original language
    content = Object.entries(segments).map(([segment_id, segment]) => {
        const speakerElement = utils.buildHtmlElement("<br><h5 class='speaker-text'>", segment.speaker, utils.getNoAgendaMessage(pageLang), "</h5>");

        const sentenceElements = segment.sentences.map(sentence => {
            return utils.buildHtmlElement(
                `<span id='${sentence.id}'>`,
                utils.joinWords(
                    sentence.translations.find(translation => {
                        return (lang && translation.lang === lang) || (!lang && translation.original === 1)
                    })?.words
                ),
                "",
                "</span>"
            )
        });

        const segmentElement = utils.buildHtmlElement("<div class='segment-text'>", sentenceElements.join(""), "", "</div>");

        return speakerElement + segmentElement;
    })

    text = title
        + "<h3 class='agendas-title'>" + utils.getAgendaTitle(pageLang) + "</h3>"
        + "<div class='agendas'>" + agendas + "</div>"
        + "<div class='segment'>" + content.join("<div class='segment'></div>") + "</div>";

    res.json({
        text: text
    });
}


const getHighlights = async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const meetingId = req.params.meetingId;
    const query = req.query.words;
    const speaker = (req.query.speaker) ? utils.parseSpeaker(req.query.speaker).join('') : undefined;
    const lang = req.query.lang;
    const looseSearch = req.query.looseSearch === "true";

    if (!query && !speaker) {
        res.status(400).json({error: "Bad request, missing query or speaker"});
        return;
    }

    // Tokenize the query and separate it into words and phrases
    let words = undefined;
    let phrases = undefined;
    if (query) {
        const tokens = utils.tokenizeQuery(query)
            .map(tokens => tokens.map(token => ASCIIFolder.foldReplacing(token.toLowerCase())))
            .map(tokens => tokens.map(token => token.replaceAll(/[^a-zA-Z0-9]/g, '')))
            .map(tokens => tokens.filter(token => token.length > 0));
        words = tokens.filter(token => token.length === 1).map(token => token.join(" ").toLowerCase());
        phrases = tokens.filter(token => token.length > 1);
    }

    // Point in time id for words and sentences index
    let wordsIndexPITId = undefined;
    let sentenceIndexPITId = undefined;
    const promises = [
        esClient.openPointInTime({
            index: process.env.WORDS_INDEX_NAME || 'words-index',
            keep_alive: '2m'
        }),
        esClient.openPointInTime({
            index: process.env.SENTENCES_INDEX_NAME || 'sentences-index',
            keep_alive: '2m'
        })
    ];

    // Search after values for words and phrases pagination
    let searchAfterWords = undefined;
    let searchAfterPhrases = undefined;

    // Size of the chunk to process at once
    const chunkSize = 1000;

    // Get appropriate strategy based on the language
    const searchStrategy = searchStrategiesSelector(lang);

    try {

        // Open point in time for words and sentences index
        const responses = await Promise.all(promises);
        wordsIndexPITId = responses[0].id;
        sentenceIndexPITId = responses[1].id;


        while (true) {
            // Execute search using the chosen strategy and process the response
            const {
                singleWordsResponse,
                phrasesResponse,
                searchAfterWords: newSearchAfterWords,
                searchAfterPhrases: newSearchAfterPhrases
            } = await searchStrategy.search(esClient, meetingId, words, phrases, speaker, lang, looseSearch, chunkSize, wordsIndexPITId, sentenceIndexPITId, searchAfterWords, searchAfterPhrases);

            // If there are no results, send empty response and break the loop
            if ((!singleWordsResponse || (singleWordsResponse && !singleWordsResponse.hits.hits.length)) &&
                (!phrasesResponse || (phrasesResponse && !phrasesResponse.hits.hits.length))) {
                break;
            }

            const singleWordsHighlights = await searchStrategy.processSingleWordsResponse(singleWordsResponse, esClient, meetingId);
            const phrasesHighlights = await searchStrategy.processPhrasesResponse(phrasesResponse, esClient, meetingId);


            // Filter out words if they are part of a sentence that is already highlighted
            const highlights = [...singleWordsHighlights, ...phrasesHighlights];
            const sentenceIds = new Set(highlights
                .flatMap(highlight => highlight.ids)
                .filter(id => id.includes(".s") && !id.includes(".w"))
            );
            const filteredHighlights = highlights.filter(highlight => {
                // Just a safety check
                if (highlight.ids.length === 0)
                    return false;
                // Sentence highlights always have exactly one id
                if (highlight.ids.length === 1 && highlight.ids[0].includes(".s") && !highlight.ids[0].includes(".w"))
                    return true;
                return !highlight.ids.some(id => sentenceIds.has(id.split(".w")[0]));
            });

            // Send the partial response to the client
            res.write(JSON.stringify({words: words, phrases: phrases, highlights: filteredHighlights}) + "\n");

            // If there are fewer results than the chunk size, break the loop
            if ((singleWordsResponse && singleWordsResponse.hits.hits.length < chunkSize) && (phrasesResponse && phrasesResponse.hits.hits.length < chunkSize)) {
                break;
            }

            // Update searchAfter values
            searchAfterWords = newSearchAfterWords;
            searchAfterPhrases = newSearchAfterPhrases;
        }

        // End the response
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({error: `Internal server error`});
    } finally {
        // Close point in time for words and sentences index
        const promises = [];
        if (wordsIndexPITId) {
            promises.push(esClient.closePointInTime({
                body: {
                    id: wordsIndexPITId
                }
            }));
        }
        if (sentenceIndexPITId) {
            promises.push(esClient.closePointInTime({
                body: {
                    id: sentenceIndexPITId
                }
            }));
        }
        await Promise.all(promises);
    }
}


const getSpeakers = async (req, res) => {
    const meetingId = req.params.meetingId;

    if (!meetingId) {
        res.status(400).json({error: "Bad request, missing meetingId"});
        return;
    }

    try {
        const response = await esClient.search({
            index: process.env.MEETINGS_INDEX_NAME || 'meetings-index',
            body: {
                query: {
                    bool: {
                        filter: [
                            {
                                term: {
                                    id: meetingId
                                }
                            }
                        ]
                    }
                },
                aggs: {
                    unique_speakers: {
                        terms: {
                            field: "sentences.speaker.keyword",
                            size: 10000
                        }
                    }
                },
                _source: false
            }
        });

        const uniqueSpeakers = response.aggregations.unique_speakers.buckets
            .map(bucket => bucket.key.trim())
            // remove empty speakers
            .filter(speaker => speaker)
            // filter out speakers that don't have capitalized first and last word and contain any digit and dont contain "Poslanec" and "Abgeordneter" or contain only one of them
            .filter((speaker) => {
                let isFirstWordCapitalized = speaker[0] === speaker[0].toUpperCase();
                let lastWord = speaker.split(" ").pop();
                let isLastWordCapitalized = lastWord[0] === lastWord[0].toUpperCase();
                let containsDigit = /\d/.test(speaker);

                let containsPoslanec = speaker.includes("Poslanec");
                let containsAbgeordneter = speaker.includes("Abgeordneter");

                return isFirstWordCapitalized && isLastWordCapitalized && !containsDigit && ((!containsPoslanec && !containsAbgeordneter) || (!containsPoslanec && containsAbgeordneter) || (containsPoslanec && !containsAbgeordneter));
            });

        // Add "Landeshauptmann" to the first index list of speakers if it is not already there
        if (!uniqueSpeakers.includes("Landeshauptmann")) {
            uniqueSpeakers.unshift("Landeshauptmann");
        }

        // Add "Deželni glavar" to the first index list of speakers if it is not already there
        if (!uniqueSpeakers.includes("Deželni glavar")) {
            uniqueSpeakers.unshift("Deželni glavar");
        }

        res.json({
            speakers: uniqueSpeakers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Internal server error"});
    }
}

module.exports = {
    getMeetingAsText,
    getHighlights,
    getSpeakers,
    getPage
};