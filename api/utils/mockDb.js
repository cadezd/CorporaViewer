const fs = require('node:fs');
const util = require('./utils');

const getWordsToHighlight = async (meetingId, query, language) => {

    let words = util.tokenizeQuery(query);

    // get single words from tokenized query (array of length 1)
    let singleWords = words.filter((word) => word.length === 1).map((word) => word[0]);
    let phrases = words.filter((word) => word.length > 1).map((phrase) => phrase.join(' '));

    console.log(singleWords);
    console.log(phrases);

    let path = `C:\\Users\\david\\OneDrive\\Desktop\\Diplomska\\CorporaViewer\\DZK\\Kranjska-jsonl\\${meetingId}_meeting.jsonl`;
    let meeting = fs.readFileSync(path, 'utf8');
    let JSONmeeting = JSON.parse(meeting);

    let wordsToHighlight = [];

    JSONmeeting.sentences.forEach((sentence) => {

        if (language !== undefined) {

            sentence.translations
                .filter((translation) => translation.lang === language)
                .forEach((translation) => {

                    translation.words.forEach((word) => {
                        singleWords.forEach((singleWord) => {

                            // if word is equal to single word or lemma is equal to single word add it to wordsToHighlight
                            if (word.text.toLowerCase() === singleWord.toLowerCase() ||
                                word.lemma.toLowerCase() === singleWord.toLowerCase()) {

                                wordsToHighlight.push(word);
                            }

                        });

                    });

                    phrases.forEach((phrase) => {
                        if (translation.text.toLowerCase().includes(phrase.toLowerCase())) {

                            // split phrase into words and check if any of the words are in the translation
                            phrase.split(' ').forEach((phraseWord) => {
                                translation.words.forEach((word) => {
                                    if (word.text.toLowerCase() === phraseWord.toLowerCase() ||
                                        word.lemma.toLowerCase() === phraseWord.toLowerCase()) {
                                        wordsToHighlight.push(word);
                                    }
                                });
                            });

                        }
                    });


                });

        } else {

            sentence.translations.forEach((translation) => {

                translation.words.forEach((word) => {
                    singleWords.forEach((singleWord) => {

                        // if word is equal to single word or lemma is equal to single word add it to wordsToHighlight
                        if (word.text.toLowerCase() === singleWord.toLowerCase() ||
                            word.lemma.toLowerCase() === singleWord.toLowerCase()) {

                            if (translation.original === 1) {
                                wordsToHighlight.push(word);
                            } else {
                                wordsToHighlight.push({
                                    id: sentence.id,
                                    coordinates: sentence.translations.find((translation) => translation.original === 1).words.map((word) => word),
                                });
                            }
                        }

                    });
                });

                phrases.forEach((phrase) => {
                    if (translation.text.toLowerCase().includes(phrase.toLowerCase())) {

                        // split phrase into words and check if any of the words are in the translation
                        phrase.split(' ').forEach((phraseWord) => {
                            translation.words.forEach((word) => {
                                if (word.text.toLowerCase() === phraseWord.toLowerCase() ||
                                    word.lemma.toLowerCase() === phraseWord.toLowerCase()) {


                                    if (translation.original === 1) {
                                        wordsToHighlight.push(word);
                                    } else {
                                        wordsToHighlight.push({
                                            id: sentence.id,
                                            words: sentence.translations.find((translation) => translation.original === 1).words.map((word) => word),
                                        });
                                    }

                                }
                            });
                        });

                    }
                });


            });

        }

    });

    console.log(wordsToHighlight);

    return wordsToHighlight;
}

module.exports = {
    getWordsToHighlight
}