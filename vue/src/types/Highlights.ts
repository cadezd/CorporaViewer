import * as PdfJsViewer from 'pdfjs-dist/web/pdf_viewer';
import {reactive} from 'vue';
import axios from "axios";

export interface Highlights {

    // variables
    meetingId?: string;
    language?: string;
    search: () => string;
    index: number;
    touched: boolean;
    total: number;

    // functions
    findMatches: () => void;
    clearMatches: () => void;
    scrollToHighlight: (...params: any) => void;
    nextHighlight: () => void;
    previousHighlight: () => void;
}

// -----------------------------
// Transcript highlights
// -----------------------------

export interface TranscriptHighlights extends Highlights {
    // variables
    highlights?: NodeListOf<Element>;
    container?: HTMLDivElement;
    transcript: string;
    originalTranscript: string;

    // functions
    applyTranscript: () => void;

    // callbacks
    updateTranscriptIndex: (index: number) => void;
    updateTranscriptTotal: (total: number) => void;
}

export class TranscriptHighlights implements TranscriptHighlights {

    static create(): TranscriptHighlights {
        return reactive(new TranscriptHighlights()) as TranscriptHighlights;
    }

    meetingId?: string;
    language?: string;
    search: () => string = () => "";
    touched: boolean = false;
    index: number = -1;
    total: number = 0;
    highlights?: NodeListOf<Element>;
    container?: HTMLDivElement;
    transcript: string = "";
    originalTranscript: string = "";

    updateAndApplyIndexChanges(index: number) {
        this.index = index;
        this.updateTranscriptIndex(this.index);
        this.applyCurrentHighlightClass();
    }

    updateAndApplyTotalChanges(total: number) {
        this.total = total;
        this.updateTranscriptTotal(this.total);
    }

    applyCurrentHighlightClass = () => {
        if (this.highlights && this.highlights.length > 0) {
            this.highlights.forEach((highlight: Element, i: number) => {
                if (i == this.index) highlight.classList.add('current-transcript-highlight');
                else highlight.classList.remove('current-transcript-highlight');
            });
        }
    }

    // this function is called whenever search string changes or original transcript changes, so transcript is never just an empty string
    findMatches = async () => {
        this.clearMatches();
        if (this.search().length > 2) {
            const searchTerms = this.search().split(' ');
            let highlightedTranscript = this.transcript;

            /*
            // simulate the api response that return following data ['DZK_1903-10-06_44_03_seg56.s11.w41', 'DZK_1903-10-06_44_03_seg56.s10.w26', 'DZK_1903-10-06_44_03_seg58.s36.w21', 'DZK_1903-10-06_44_03_seg59.s11.w18']
            let promise: Promise<string[]> = new Promise((resolve, reject) => {
                setTimeout(() => resolve(['DZK_1903-10-06_44_03_seg56.s11.w41', 'DZK_1903-10-06_44_03_seg56.s10.w26', 'DZK_1903-10-06_44_03_seg58.s36.w21', 'DZK_1903-10-06_44_03_seg59.s11.w18']), 2000);
            });

            await promise.then((data: string[]) => {
                data.forEach((id: string) => {
                    let element = document.getElementById(id);
                    if (element)
                        element.classList.add('transcript-highlight');
                });
            });

             */

            let URL = process.env.VUE_APP_API_URL + `/meetings/${this.meetingId}/getWordsToHighlight?words=${this.search()}`;
            if (this.language) URL += `&language=${this.language}`;

            let response = await axios.get(URL);

            let wordsToHighlight = response.data;

            wordsToHighlight.forEach((word: any) => {
                let tmp = document.createElement('template');
                tmp.innerHTML = highlightedTranscript;

                let element = tmp.content.getElementById(word.id);
                if (element)
                    element.classList.add('transcript-highlight');

                highlightedTranscript = tmp.innerHTML;
            });

            /*
            ids.forEach((id: string) => {
                let tmp = document.createElement('template');
                tmp.innerHTML = highlightedTranscript;

                let element = tmp.content.getElementById(id);
                if (element)
                    element.classList.add('transcript-highlight');

                highlightedTranscript = tmp.innerHTML;
            });

             */


            /*
            searchTerms.forEach((searchTerm: string) => {
                const regex = new RegExp(`(?!<[^>]*>)${searchTerm}(?![^<]*>)`, 'gi');
                highlightedTranscript = highlightedTranscript.replace(regex, (match) => `<span class="transcript-highlight">${match}</span>`);
            });
            */


            this.transcript = highlightedTranscript;
            if (this.container) {
                this.container.innerHTML = highlightedTranscript;
                this._saveHighlights(true);
            }
        } else {
            this.transcript = this.originalTranscript;
            if (this.container) this.container.innerHTML = this.transcript;
        }
    }

    private _saveHighlights = (shouldScrollToHighlight: boolean) => {
        this.highlights = this.container?.querySelectorAll(`.transcript-highlight`);
        if (this.highlights && this.highlights?.length > 0) {
            this.updateAndApplyIndexChanges(0);
            this.updateAndApplyTotalChanges(this.highlights.length)
            this.touched = true;
            if (shouldScrollToHighlight) this.scrollToHighlight();
        }
    }

    scrollToHighlight = () => {
        if (this.highlights && this.highlights.length > 0) {
            const highlight = this.highlights[this.index];
            highlight.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    clearMatches() {
        this.transcript = this.originalTranscript;
        if (this.container) this.container.innerHTML = this.transcript;
        this.highlights = undefined;
        this.updateAndApplyIndexChanges(-1);
        this.updateAndApplyTotalChanges(0);
        this.touched = true;
    }

    nextHighlight: () => void = () => {
        this.touched = true;
        this.updateAndApplyIndexChanges((this.index + 1) % this.total);
        this.scrollToHighlight();
    }

    previousHighlight: () => void = () => {
        this.touched = true;
        this.updateAndApplyIndexChanges((this.index - 1 + this.total) % this.total);
        this.scrollToHighlight();
    }

    updateTranscriptIndex: (index: number) => void = (index: number) => {
        console.log("updateTranscriptIndex not implemented");
    };

    updateTranscriptTotal: (total: number) => void = (total: number) => {
        console.log("updateTranscriptTotal not implemented");
    };

    applyTranscript: () => void = () => {
        if (this.container) {
            this.container.innerHTML = this.transcript;
            this._saveHighlights(false);
        } else console.error("container not defined");
    }
}

// -----------------------------
// PDF highlights
// -----------------------------

export class PdfPageMatch {
    id: number;
    page: number;
    wordIndex: number;
    htmlElement?: HTMLElement;

    constructor(id: number, page: number, wordIndex: number, htmlElement?: HTMLElement) {
        this.id = id;
        this.page = page;
        this.wordIndex = wordIndex;
        this.htmlElement = htmlElement;
    }

    loaded = () => {
        return this.htmlElement != undefined;
    }
}

export interface PdfHighlights extends Highlights {
    // variables
    highlights: PdfPageMatch[];
    eventBus?: PdfJsViewer.EventBus;
    source?: any;

    // functions
    onMatchesFound: (event: any) => void;
    onNoMatchesFound: () => void;
    refreshHighlights: () => void;
    displayedHighlights: () => string;

    // callbacks
    scrollToHighlight: () => void;
    prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void;
    _nextHighlight: () => void;
    _previousHighlight: () => void;
}

export class PdfHighlights implements PdfHighlights {

    static create(): PdfHighlights {
        return reactive(new PdfHighlights()) as PdfHighlights;
    }

    // variables
    meetingId?: string;
    language?: string;
    search: () => string = () => "";
    touched: boolean = false;
    index: number = -1;
    total: number = 0;
    eventBus?: PdfJsViewer.EventBus;
    source?: any;

    private _createPageMatches = (pageMatchesArray: any[]) => {
        let i = 0;
        this.highlights = [];

        for (let page = 0; page < pageMatchesArray.length; page++) {
            pageMatchesArray[page].forEach((match: any) => {
                const id = i;
                const pageMatch = new PdfPageMatch(id, page, match, undefined);
                this.highlights.push(pageMatch);
                i++;
            });
        }
    }

    // functions
    findMatches = () => {
        if (this.search().length > 2) {
            console.log(this.source)
            /*
            this.eventBus?.dispatch('find', {
                source: this.source,
                highlightAll: true,
                type: "",
                caseSensitive: false,
                query: this.search().split(' ')
            });

             */
            this.touched = true;
        } else if (this.total > 0) {
            this.clearMatches();
        }
    }

    onMatchesFound = (event: any) => {
        if (event.matchesCount.total == 0) {
            console.error('calling onMatchesFound with no matches, should not happen');
            return;
        }
        if (this.touched) {
            this.total = event.matchesCount.total;
            this.touched = false;
            this._createPageMatches(event.source.pageMatches);
            this.index = 0;
            this.prepHighlightBeforeScrolling('find');
        }
    }

    refreshHighlights = () => {
        if (this.total > 0) this.prepHighlightBeforeScrolling('resize');
    }

    private _reset = () => {
        this.index = -1;
        this.total = 0;
        this.highlights = [];
        this.touched = false;
    }

    onNoMatchesFound = () => {
        this._reset();
    }

    clearMatches = () => {
        this._reset();
        this.eventBus?.dispatch('find', {
            source: this.source,
            type: "clear"
        })
    }

    scrollToHighlight: () => void = () => {
        console.log("scrollToHighlight not implemented");
    }

    prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void = () => {
        console.log("prepHighlightBeforeScrolling not implemented");
    }

    nextHighlight = () => {
        this.index = (this.index + 1) % this.total;
        this._nextHighlight();
    }

    previousHighlight = () => {
        this.index = (this.index - 1 + this.total) % this.total;
        this._previousHighlight();
    }

    _nextHighlight: () => void = () => {
        console.log("_nextHighlight not implemented");
    }

    _previousHighlight: () => void = () => {
        console.log("_previousHighlight not implemented");
    }

    displayedHighlights = () => {
        if (this.search().length <= 2) {
            return ""
        } else if (this.total == 0) {
            return "Ni zadetkov"
        } else {
            return `Zadetek ${this.index + 1} / ${this.total}`;
        }
    }
}