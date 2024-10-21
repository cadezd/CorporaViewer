require('dotenv').config();
const utils = require("../utils/utils");
const url = require("node:url");


class BaseSearchStrategy {
    /**
     * Searches for the words and phrases of a meeting in given language that satisfy the search criteria.
     *
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId - ID of the meeting
     * @param {string[]} words - single words to search for
     * @param {string[][]} phrases -  words to search for in a sentence
     * @param {string|undefined} speaker - name of the speaker
     * @param {string|undefined} lang - language of the words to search for, if undefined, search in the original language
     * @param {boolean} looseSearch - if true, apply fuzzy search
     * @param {number} chunkSize - size of the chunks to split the search into
     * @param {string} pitIdWords - point in time id for the words index
     * @param {string} pitIdSentences - point in time id for the sentences index
     * @param {string|undefined} searchAfterWords - unique identifier for deep pagination in the words index
     * @param {string|undefined} searchAfterPhrases - unique identifier for deep pagination in the sentences index
     * @returns {Promise<{ SingleWordsResponse, PhrasesResponse, string, string }>}
     */

    async search(esClient, meetingId, words, phrases, speaker, lang, looseSearch, chunkSize, pitIdWords, pitIdSentences, searchAfterWords, searchAfterPhrases) {

        // Build the query body for single words and phrases
        const singleWordsQueryBody = utils.wordsSearchQueryBuilder(meetingId, words, speaker, lang, looseSearch);
        const phrasesQueryBody = utils.phrasesSearchQueryBuilder(meetingId, phrases, speaker, lang, looseSearch);

        const promises = [
            esClient.search({
                size: chunkSize,
                track_total_hits: false,
                body: {
                    query: singleWordsQueryBody,
                },
                sort: [
                    {
                        "word_id.sort": {
                            order: "asc"
                        }
                    }
                ],
                pit: {
                    id: pitIdWords,
                    keep_alive: "1m"
                },
                ...(searchAfterWords !== undefined && {search_after: [searchAfterWords]}),
            }),
            esClient.search({
                size: chunkSize,
                track_total_hits: false,
                body: {
                    query: phrasesQueryBody,
                },
                min_score: 1,
                sort: [
                    {
                        "sentence_id.sort": {
                            order: "asc"
                        }
                    }
                ],
                pit: {
                    id: pitIdSentences,
                    keep_alive: "1m"
                },
                ...(searchAfterPhrases !== undefined && {search_after: [searchAfterPhrases]}),
            })
        ];

        // Fetch the data for single words and phrases
        const responses = await Promise.allSettled(promises);
        const singleWordsResponse = responses[0].status === "fulfilled" ? responses[0].value : undefined;
        const phrasesResponse = responses[1].status === "fulfilled" ? responses[1].value : undefined;

        // Get the unique identifier for deep pagination
        const singleWordsHits = singleWordsResponse ? singleWordsResponse.hits.hits : [];
        const phrasesHits = phrasesResponse ? phrasesResponse.hits.hits : [];
        searchAfterWords = singleWordsHits.length > 0 ? singleWordsHits[singleWordsHits.length - 1].sort[0] : searchAfterWords;
        searchAfterPhrases = phrasesHits.length > 0 ? phrasesHits[phrasesHits.length - 1].sort[0] : searchAfterPhrases;

        return {singleWordsResponse, phrasesResponse, searchAfterWords, searchAfterPhrases};
    }

    /**
     * Applies additional processing to the response (such as getting coordinates of a sentence that contains the non-original word)
     * and returns id and coordinates of the words and sentences that satisfy the search criteria.
     *
     * @param {SingleWordsResponse} singleWordsResponse
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId - ID of the meeting
     * @returns {Promise<Highlight[]>}
     */
    async processSingleWordsResponse(singleWordsResponse, esClient, meetingId) {
        throw new Error("processResponse() method must be implemented.");
    }

    /**
     * Applies additional processing to the response (such as getting coordinates of a sentence that contains the non-original phrase)
     * and getting the words that are in the searched phrase out of the original sentences.
     *
     * @param {PhrasesResponse} phrasesResponse
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId  - ID of the meeting
     * @returns {Promise<Highlight[]>}
     */
    async processPhrasesResponse(phrasesResponse, esClient, meetingId) {
        throw new Error("processResponse() method must be implemented.");
    }
}


class OriginalLanguageSearchStrategy extends BaseSearchStrategy {

    async processSingleWordsResponse(singleWordsResponse, esClient, meetingId) {

        // Return empty array if there are no words to process
        if (!singleWordsResponse)
            return [];

        // For translated words (names excluded), we collect the (UNIQUE) ids of the sentences that contain them
        // We will use these ids to get the coordinates of the sentences that contain the translated words
        const translatedWordsSentencesIds = singleWordsResponse.hits.hits
            .filter(hit => hit._source.original === 0 && hit._source.propn !== 1)
            .map(hit => hit._source.sentence_id)
            .filter((value, index, self) => self.indexOf(value) === index);

        // We collect the original words
        const originalWords = singleWordsResponse.hits.hits
            .filter(hit => hit._source.original === 1 || hit._source.propn === 1)
            .filter(hit => !translatedWordsSentencesIds.includes(hit._source.sentence_id))
            .map(hit => ({
                ids: [hit._source.word_id],
                texts: [hit._source.text],
                lemmas: [hit._source.lemma],
                rects: utils.groupCoordinates(hit._source.coordinates),
            }));

        // Fetch the data for sentences that contain the translated words
        const translatedSentencesQueryBody = utils.sentencesCoordinatesQueryBuilder(meetingId, translatedWordsSentencesIds);
        const translatedSentencesResponse = await esClient.search({
            index: "sentences-index",
            body: {
                query: translatedSentencesQueryBody,
            },
            size: 10000
        });
        const translatedSentences = translatedSentencesResponse.hits.hits.map(hit => ({
            ids: [hit._source.sentence_id],
            texts: [hit._source.translations.filter(translation => translation.original === 0).map(translation => translation.text)],
            rects: utils.groupCoordinates(hit._source.coordinates),
        }));

        return [...originalWords, ...translatedSentences];
    }

    async processPhrasesResponse(phrasesResponse, esClient, meetingId) {

        // Return empty array if there are no phrases to process
        if (!phrasesResponse)
            return [];

        // For translated phrases, we collect the data of the sentences that contains them
        const translatedSentences = phrasesResponse.hits.hits
            .filter(hit => hit.inner_hits.matched_translation.hits.hits[0]._source.original === 0)
            .map(hit => ({
                ids: [hit._source.sentence_id],
                //texts: [hit.inner_hits.matched_translation.hits.hits.map(hit => hit._source.text)],
                rects: utils.groupCoordinates(hit._source.coordinates)
            }));

        // For original phrases, we collect the data of the sentences id and highlights (text that shows the matched words - wrapped in <em> tags)
        const originalSentencesIdsAndHighlights = phrasesResponse.hits.hits
            .filter(hit => hit.inner_hits.matched_translation.hits.hits[0]._source.original === 1)
            .map(hit => ({
                id: hit._source.sentence_id,
                highlight: hit.inner_hits.matched_translation.hits.hits[0].highlight["translations.text"][0]
            }));

        // For each original sentence that contains searched phrase, we create a query to get the words that are highlighted in the sentence
        const promises = [];
        for (const originalSentenceIdAndHighlights of originalSentencesIdsAndHighlights) {
            const sentenceId = originalSentenceIdAndHighlights.id;
            const highlightedWords = originalSentenceIdAndHighlights.highlight;
            const highlightedWordsPositions = utils.getEmTagIndexes(highlightedWords);

            const queryBody = {
                bool: {
                    filter: [
                        {
                            term: {
                                "sentence_id": sentenceId
                            }
                        },
                        {
                            term: {
                                original: 1
                            }
                        },
                        {
                            terms: {
                                wpos: highlightedWordsPositions
                            }
                        }
                    ]
                }
            }

            promises.push(esClient.search({
                index: process.env.WORDS_INDEX_NAME || "words-index",
                size: 10000,
                track_total_hits: false,
                body: {
                    query: queryBody,
                },

            }));
        }

        // Fetch the data for the words that are highlighted in the original sentences
        const responses = await Promise.allSettled(promises);
        const originalWords = responses
            .filter(response => response.status === "fulfilled")
            .map(response => response.value.hits.hits
                .reduce((acc, hit, index, hits) => {
                    // If it's the first word or the difference in `wpos` between the current and previous word is greater than one
                    if (index === 0 || (hit._source.wpos - hits[index - 1]._source.wpos) > 1) {

                        // Group the coordinates of the previous group
                        if (index > 0) {
                            acc[acc.length - 1].rects = utils.groupCoordinates(acc[acc.length - 1].rects);
                        }

                        // Start a new group
                        acc.push({ids: [], /*texts: [], lemmas: [],*/ rects: []});
                    }
                    // Add word details to the current group
                    const currentGroup = acc[acc.length - 1];
                    currentGroup.ids.push(hit._source.word_id);
                    /*currentGroup.texts.push(hit._source.text);
                    currentGroup.lemmas.push(hit._source.lemma);*/
                    currentGroup.rects.push(...hit._source.coordinates);

                    // Group the coordinates of the last group
                    if (index === hits.length - 1) {
                        currentGroup.rects = utils.groupCoordinates(currentGroup.rects);
                    }

                    return acc;
                }, []) // Initialize acc as an empty array to hold word groups
            );


        return [...translatedSentences, ...(originalWords.flat())];
    }

}

class TranslatedLanguageSearchStrategy extends BaseSearchStrategy {

    async processSingleWordsResponse(singleWordsResponse, esClient, meetingId) {

        // Return empty array if there are no words to process
        if (!singleWordsResponse)
            return [];

        // Return matched words in the translated language (we do not search in other translations when lang is specified)
        return singleWordsResponse.hits.hits
            .map(hit => ({
                ids: [hit._source.word_id],
                texts: [hit._source.text],
                lemmas: [hit._source.lemma],
                rects: [],
            }));
    }


    async processPhrasesResponse(phrasesResponse, esClient, meetingId) {

        // Return empty array if there are no phrases to process
        if (!phrasesResponse)
            return [];

        // Collect the data of the sentences id and highlights (text that shows the matched words - wrapped in <em> tags)
        const sentencesIdsHighlightsLang = phrasesResponse.hits.hits
            .map(hit => ({
                id: hit._source.sentence_id,
                highlight: hit.inner_hits.matched_translation.hits.hits[0].highlight["translations.text"][0],
                language: hit.inner_hits.matched_translation.hits.hits[0]._source.lang
            }));


        // For each sentence that contains searched phrase, we create a query to get the words that are highlighted in the sentence
        const promises = [];
        for (const sentenceIdHighlightsLang of sentencesIdsHighlightsLang) {
            const sentenceId = sentenceIdHighlightsLang.id;
            const highlightedWords = sentenceIdHighlightsLang.highlight;
            const highlightedWordsPositions = utils.getEmTagIndexes(highlightedWords);
            const lang = sentenceIdHighlightsLang.language;

            const queryBody = {
                bool: {
                    filter: [
                        {
                            term: {
                                "sentence_id": sentenceId
                            }
                        },
                        {
                            term: {
                                lang: lang
                            }
                        },
                        {
                            terms: {
                                wpos: highlightedWordsPositions
                            }
                        }
                    ]
                }
            }

            promises.push(await esClient.search({
                index: process.env.WORDS_INDEX_NAME || "words-index",
                size: 10000,
                track_total_hits: false,
                body: {
                    query: queryBody,
                },
            }));
        }

        // Fetch the data for the words that are highlighted in the original sentences
        const responses = await Promise.allSettled(promises);
        const groups = responses
            .filter(response => response.status === "fulfilled")
            .map(response => response.value.hits.hits
                .reduce((acc, hit, index, hits) => {
                    // If it's the first word or the difference in `wpos` between the current and previous word is greater than one
                    if (index === 0 || (hit._source.wpos - hits[index - 1]._source.wpos) > 1) {
                        // Start a new group
                        acc.push({ids: [], texts: [], lemmas: [], rects: []});
                    }
                    // Add word details to the current group
                    const currentGroup = acc[acc.length - 1];
                    currentGroup.ids.push(hit._source.word_id);
                    currentGroup.texts.push(hit._source.text);
                    currentGroup.lemmas.push(hit._source.lemma);


                    currentGroup.coordinates.push(...hit._source.coordinates);

                    return acc;
                }, []) // Initialize acc as an empty array to hold word groups
            );

        return groups.flat();
    }
}

module.exports = {
    OriginalLanguageSearchStrategy,
    TranslatedLanguageSearchStrategy
}