const {
    OriginalLanguageSearchStrategy,
    TranslatedLanguageSearchStrategy
} = require('./searchStrategies');

const getSearchStrategy = (lang) => {
    if (lang) {
        return new TranslatedLanguageSearchStrategy();
    } else {
        return new OriginalLanguageSearchStrategy();
    }
};

module.exports = getSearchStrategy;