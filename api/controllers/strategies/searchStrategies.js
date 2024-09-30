require('dotenv').config();
const utils = require("../utils/utils");

class BaseSearchStrategy {
    /**
     * Searches for the words and phrases of a meeting in given language that satisfy the search criteria.
     *
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId - ID of the meeting
     * @param {string[]} words - single words to search for
     * @param {string[][]} phrases -  words to search for in a sentence
     * @param {string|undefined} speaker - name of the speaker
     * @param {string} lang - language of the words to search for, if undefined, search in the original language
     * @returns {{ wordsResponse, phrasesResponse }}
     */

    async search(esClient, meetingId, words, phrases, speaker, lang) {
        throw new Error("searchWords() method must be implemented.");
    }

    /**
     * Applies additional processing to the response (such as getting coordinates of a sentence that contains the non-original word)
     * and returns id and coordinates of the words and sentences that satisfy the search criteria.
     *
     * @param {JSON[]} singleWordsResponse
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId - ID of the meeting
     * @returns {JSON[{ids, coordinates}]}
     */
    async processSingleWordsResponse(singleWordsResponse, esClient, meetingId) {
        throw new Error("processResponse() method must be implemented.");
    }

    /**
     * Applies additional processing to the response (such as getting coordinates of a sentence that contains the non-original phrase)
     * and getting the words that are in the searched phrase out of the original sentences.
     *
     * @param {JSON[]} phrasesResponse
     * @param {Client} esClient - Elasticsearch client
     * @param {string} meetingId  - ID of the meeting
     * @returns {JSON[{ids, coordinates}]}
     */
    async processPhrasesResponse(phrasesResponse, esClient, meetingId) {
        throw new Error("processResponse() method must be implemented.");
    }
}


class OriginalLanguageSearchStrategy extends BaseSearchStrategy {

    async search(esClient, meetingId, words, phrases, speaker, lang) {

        const singleWordsQueryBody = utils.wordsSearchQueryBuilder(meetingId, words, speaker, undefined);
        const phrasesQueryBody = utils.phrasesSearchQueryBuilder(meetingId, phrases, speaker, undefined);

        const promises = [
            esClient.search({
                index: process.env.WORDS_INDEX_NAME || "words-index",
                body: {
                    query: singleWordsQueryBody,
                },
                size: 1000
            }),
            esClient.search({
                index: process.env.SENTENCES_INDEX_NAME || "sentences-index",
                min_score: 1,
                body: {
                    query: phrasesQueryBody,
                },
                size: 1000,
                highlight: {
                    number_of_fragments: 0,
                    fragment_size: 10000,
                    fields: {
                        "translations.text": {}
                    }
                }
            })
        ];

        const responses = await Promise.allSettled(promises);

        const singleWordsResponse = responses[0].status === "fulfilled" ? responses[0].value : undefined;
        const phrasesResponse = responses[1].status === "fulfilled" ? responses[1].value : undefined;

        return {singleWordsResponse, phrasesResponse};
    }

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
                //texts: [hit._source.text],
                //lemmas: [hit._source.lemma],
                coordinates: hit._source.coordinates,
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
            //texts: [hit._source.translations.filter(translation => translation.original === 0).map(translation => translation.text)],
            coordinates: hit._source.coordinates,
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
                coordinates: hit._source.coordinates,
            }));

        // For original phrases, we collect the data of the sentences id and highlights (text that shows the matched words - wrapped in <em> tags)
        const originalSentencesIdsAndHighlights = phrasesResponse.hits.hits
            .filter(hit => hit.inner_hits.matched_translation.hits.hits[0]._source.original === 1)
            .map(hit => ({
                id: hit._source.sentence_id,
                highlight: hit.highlight["translations.text"][0]
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
                body: {
                    query: queryBody,
                },
                size: 10000
            }));
        }

        // Fetch the data for the words that are highlighted in the original sentences
        const responses = await Promise.allSettled(promises);
        const originalWords = responses
            .filter(response => response.status === "fulfilled")
            .map(response => response.value.hits.hits
                .reduce((acc, hit) => {
                        acc.ids.push(hit._source.word_id);
                        //acc.texts.push(hit._source.text);
                        //acc.lemmas.push(hit._source.lemma);
                        acc.coordinates.push(...hit._source.coordinates);
                        return acc;
                    }, {ids: [], /*texts: [], lemmas: [],*/ coordinates: []}
                )
            );

        return [...translatedSentences, ...originalWords];
    }

}

class TranslatedLanguageSearchStrategy extends BaseSearchStrategy {


    async search(esClient, meetingId, words, phrases, speaker, lang) {
        const singleWordsQueryBody = utils.wordsSearchQueryBuilder(meetingId, words, speaker, lang);

        return await esClient.search({
            index: process.env.WORDS_INDEX_NAME || "words-index",
            body: {
                query: singleWordsQueryBody,
            },
            size: 10000
        });
    }

    // TODO: implement
    async processSingleWordsResponse(response, esClient, meetingId) {
        return response.hits.hits.map(hit => ({
            id: hit._source.word_id,
            text: hit._source.text,
            lemma: hit._source.lemma,
            coordinates: hit._source.coordinates,
        }));
    }

    // TODO: implement
    async processPhrasesResponse(phrasesResponse, phrases, esClient, meetingId) {
        return phrasesResponse.hits.hits.map(hit => ({
            id: hit._source.sentence_id,
            text: hit.inner_hits.matched_translation.hits.hits.map(hit => hit._source.text),
            coordinates: hit._source.coordinates,
        }));
    }
}

module.exports = {
    OriginalLanguageSearchStrategy,
    TranslatedLanguageSearchStrategy
}