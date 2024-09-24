const fs = require('node:fs');
const util = require('./utils');

const getWordsToHighlight = async (meetingId, query, language) => {

    let words = util.tokenizeQuery(query);



    // get single words from tokenized query (array of length 1)
    let singleWords = words.filter((word) => word.length === 1).map((word) => word[0].toLowerCase().trim());
    let phrases = words.filter((word) => word.length > 1).map((phrase) => phrase.join(' ').toLowerCase().trim());



    let path = `C:\\Users\\david\\OneDrive\\Desktop\\Diplomska\\CorporaViewer\\DZK\\Kranjska-jsonl\\${meetingId}_meeting.jsonl`;
    let meeting = fs.readFileSync(path, 'utf8');
    let JSONmeeting = JSON.parse(meeting);

    let wordsToHighlight = [];

    JSONmeeting.sentences.forEach((sentence) => {

        if (language !== undefined) {

            // get the correct translation
            sentence.translations
                .filter((translation) => translation.lang === language)
                .forEach((translation) => {

                    // for single words check if the word matches any of the words or lemmas in the translation
                    // and add it to the words to highlight
                    translation.words
                        .filter((word) => singleWords.includes(word.text.toLowerCase().trim()) || singleWords.includes(word.lemma.toLowerCase().trim()))
                        .forEach((word) => {
                            wordsToHighlight.push([word]);
                        });

                    // for phrases check if the phrase is in the translation
                    phrases.forEach((phrase) => {
                        if (translation.text.toLowerCase().includes(phrase.toLowerCase())) {

                            // split phrase into words and check if any of the words are in the translation
                            let phraseWords = phrase.split(' ');

                            let phraseWordsToHighlight = translation.words
                                // assign index to each word
                                .map((word, index) => ({word, index}))
                                // filter out words that are not in the phrase
                                .filter(({word, index}) => phraseWords.includes(word.text.toLowerCase()))
                                // keep only words that are in sorted order (index between words is 1)
                                .filter(({word, index}, i, arr) => {
                                    if (i === 0) {
                                        return arr[i + 1].index - index === 1;
                                    } else {
                                        return index - arr[i - 1].index === 1;
                                    }
                                })
                                // add words to wordsToHighlight
                                .map(({word}) => {
                                    return word;
                                });

                            wordsToHighlight.push(phraseWordsToHighlight);

                        }
                    });


                });

        } else {

            sentence.translations.forEach((translation) => {

                // for single words check if the word matches any of the words or lemmas in the translation
                // and add it to the words to highlight
                translation.words
                    .filter((word) => singleWords.includes(word.text.toLowerCase().trim()) || singleWords.includes(word.lemma.toLowerCase().trim()))
                    .forEach((word) => {

                        // if the translation is the original one, add the word to the wordsToHighlight
                        if (translation.original === 1) {
                            wordsToHighlight.push([word]);
                        } else { // if the translation is not the original one, add the whole sentence
                            wordsToHighlight.push([{
                                id: sentence.id,
                                coordinates: sentence.translations.find((translation) => translation.original === 1).words.map((word) => word),
                            }]);
                        }

                    });

                // for phrases check if the phrase is in the translation
                phrases.forEach((phrase) => {
                    if (translation.text.toLowerCase().includes(phrase.toLowerCase())) {

                        if (translation.original === 0) {
                            wordsToHighlight.push([{
                                id: sentence.id,
                                coordinates: sentence.translations.find((translation) => translation.original === 1).words.map((word) => word),
                            }]);

                        } else {

                            // split phrase into words and check if any of the words are in the translation
                            let phraseWords = phrase.split(' ');

                            let phraseWordsToHighlight = translation.words
                                // assign index to each word
                                .map((word, index) => ({word, index}))
                                // filter out words that are not in the phrase
                                .filter(({word, index}) => phraseWords.includes(word.text.toLowerCase()))
                                // keep only words that are in sorted order
                                .filter(({word, index}, i, arr) => {
                                    if (i === 0) {
                                        return arr[i + 1].index - index === 1;
                                    } else {
                                        return index - arr[i - 1].index === 1;
                                    }
                                })
                                .map(({word}) => {
                                    return word;
                                });

                            wordsToHighlight.push(phraseWordsToHighlight);

                        }

                        console.log(wordsToHighlight);

                    }
                });

            });

        }

    });


    return wordsToHighlight;
}

module.exports = {
    getWordsToHighlight
}