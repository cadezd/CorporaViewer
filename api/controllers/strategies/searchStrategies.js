require('dotenv').config();
const utils = require("../utils/utils");
const ASCIIFolder = require("fold-to-ascii");

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
     * @returns {JSON[{id, coordinates}]}
     */
    async processSingleWordsResponse(singleWordsResponse, esClient, meetingId) {
        throw new Error("processResponse() method must be implemented.");
    }

    /**
     * Applies additional processing to the response (such as getting coordinates of a sentence that contains the non-original phrase)
     * and getting the words that are in the searched phrase out of the original sentences.
     *
     * @param {JSON[]} phrasesResponse
     * @param {string[][]} phrases
     * @param {Client} esClient
     * @param {string} meetingId
     * @returns {JSON[{id, coordinates}]}
     */
    async processPhrasesResponse(phrasesResponse, phrases, esClient, meetingId) {
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
                min_score: 0.5,
                body: {
                    query: phrasesQueryBody,
                },
                size: 1000
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
            .filter(hit => hit._source.original !== 1 && hit._source.propn !== 1)
            .map(hit => hit._source.sentence_id)
            .filter((value, index, self) => self.indexOf(value) === index);

        // We collect the original words
        const originalWords = singleWordsResponse.hits.hits
            .filter(hit => hit._source.original === 1)
            .filter(hit => !translatedWordsSentencesIds.includes(hit._source.sentence_id))
            .map(hit => ({
                id: hit._source.word_id,
                text: hit._source.text,
                lemma: hit._source.lemma,
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
            id: hit._source.sentence_id,
            text: hit._source.translations.filter(translation => translation.original === 0).map(translation => translation.text),
            coordinates: hit._source.coordinates,
        }));

        return [...originalWords, ...translatedSentences];
    }

    async processPhrasesResponse(phrasesResponse, phrases, esClient, meetingId) {

        // Return empty array if there are no phrases to process
        if (!phrasesResponse)
            return [];

        // For non-original phrases, we need to get the coordinates of the UNIQUE whole sentence that contains them
        const nonOriginalPhrasesSentences = phrasesResponse.hits.hits
            .filter(hit => hit.inner_hits.matched_translation.hits.hits[0]._source.original !== 1)
            .filter((value, index, self) => self.indexOf(value) === index)
            .map(hit => ({
                id: hit._source.sentence_id,
                text: hit.inner_hits.matched_translation.hits.hits.map(hit => hit._source.text),
                coordinates: hit._source.coordinates,
            }));


        // Save the ids of the original phrases sentences that contain original phrases
        const originalPhrasesSentencesIds = phrasesResponse.hits.hits
            .filter(hit => hit.inner_hits.matched_translation.hits.hits[0]._source.original === 1)
            .filter(hit => !nonOriginalPhrasesSentences.map(sentence => sentence.id).includes(hit._source.sentence_id))
            .map(hit => hit._source.sentence_id);

        if (originalPhrasesSentencesIds.length === 0) {
            return [...nonOriginalPhrasesSentences];
        }

        const promises = [];
        for (const phrase of phrases) {
            // Query body to get the words that are in searched phrase out of the original sentences
            const phraseWordsQueryBody = utils.wordsInPhrasesSearchQueryBuilder(meetingId, phrase, originalPhrasesSentencesIds);

            promises.push(esClient.search({
                index: process.env.WORDS_INDEX_NAME || "words-index",
                body: {
                    query: phraseWordsQueryBody,
                },
                size: 0,
                aggs: {
                    group_by_sentence_id: {
                        composite: {
                            size: 1000,
                            sources: [
                                {sentence_id: {terms: {field: "sentence_id"}}}
                            ]
                        },
                        aggregations: {
                            top_words: {
                                top_hits: {
                                    sort: [{pos: {order: "asc"}}],
                                    size: 100
                                }
                            }
                        }
                    }
                }
            }));
        }

        const responses = await Promise.allSettled(promises);

        let originalPhrasesWordsResult = [];
        for (let i = 0; i < responses.length; i++) {

            if (responses[i].status === "rejected") {
                console.log(responses[i].reason);
                continue;
            }

            const result = responses[i].value;
            const searchedPhrase = phrases[i];

            // Group the words by sentence_id
            const originalPhrasesWords = result.aggregations.group_by_sentence_id.buckets
                .map(bucket => ({
                    id: bucket.key.sentence_id,
                    words: bucket.top_words.hits.hits.map(hit => ({
                        id: hit._source.word_id,
                        pos: hit._source.pos,
                        text: hit._source.text,
                        lemma: hit._source.lemma,
                        coordinates: hit._source.coordinates,
                    }))
                }))
                .filter(phrase => phrase.words.length >= searchedPhrase.length);


            // get only those words that are in the searched phrase in the correct order (suing sliding window)
            let slidingWindowStart = 0;
            let slidingWindowEnd = 0;

            for(let j = 0; j < originalPhrasesWords.length; j++) {
                const phraseWords = originalPhrasesWords[j];
                const phraseWordsTexts = phraseWords.words.map(word => ASCIIFolder.foldReplacing(word.text.toLowerCase()));

                for (let k = 0; k < phraseWordsTexts.length - searchedPhrase.length; k++) {
                    const window = phraseWordsTexts.slice(k, k + searchedPhrase.length);

                    // TODO: popravi da se
                    if (this.arraysEqual(window, searchedPhrase) ) {
                        slidingWindowStart = k;
                        slidingWindowEnd = k + searchedPhrase.length;
                        phraseWords.words = phraseWords.words.slice(slidingWindowStart, slidingWindowEnd);
                        console.log("Found phrase: ", searchedPhrase);
                        console.log("Window: ", window);
                        console.log("Phrase Words: ", phraseWordsTexts);
                        console.log("Coordinates: ", phraseWords.words.map(word => word.coordinates));
                        break;
                    }
                }
            }

            originalPhrasesWordsResult.push(...originalPhrasesWords);
        }

        return [...nonOriginalPhrasesSentences, ...originalPhrasesWordsResult];
    }

    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false; // Check if lengths are different
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false; // Check if elements at each position are different
        }
        return true; // Arrays are equal
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