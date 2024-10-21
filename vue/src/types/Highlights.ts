import * as PdfJsViewer from 'pdfjs-dist/web/pdf_viewer';
import {reactive} from 'vue';
import {Highlight} from "@/types/Highlight";
import {AnnotationFactory} from 'annotpdf';
import {Rect} from "@/types/Rect";

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
        await this.clearMatches();

        if (this.search().length <= 2)
            return;


        let URL = process.env.VUE_APP_API_URL + `/meetings/${this.meetingId}/getHighlights?words=${this.search()}`;
        if (this.language) URL += `&lang=${this.language}`;

        URL += `&looseSearch=true`;
        // TODO: add speaker to the URL
        // TODO: add looseSearch to the URL

        let response = undefined;
        try {
            response = await fetch(URL);
        } catch (error) {
            console.error('Request error:', error);
            return;
        }

        if (!response || !response.ok || !response.body) {
            console.error('Response not ok');
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        let transcriptContent = new DOMParser().parseFromString(this.transcript, 'text/html');

        while (true) {
            const {done, value} = await reader.read();

            if (done)
                break;

            // Decode the chunk and add it to the buffer
            buffer += decoder.decode(value, {stream: true});

            // Process the complete JSON object from the buffer
            let boundary = buffer.indexOf('\n');


            while (boundary !== -1) {
                const chunk = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 1);

                if (chunk.trim()) {
                    let parsedChunk = undefined;
                    try {
                        parsedChunk = JSON.parse(chunk);
                    } catch (e) {
                        console.error("Error parsing chunk:", e);
                        continue;
                    }

                    const highlights: Highlight[] = parsedChunk.highlights;

                    for (const highlight of highlights) {
                        const firstChild = transcriptContent.getElementById(highlight.ids[0]);
                        if (!firstChild) {
                            console.error("Element not found");
                            continue;
                        }

                        const newParent = transcriptContent.createElement('span');
                        newParent.classList.add('transcript-highlight');

                        firstChild.parentNode?.insertBefore(newParent, firstChild);

                        highlight.ids.forEach((id: string) => {
                            const element = transcriptContent.getElementById(id);
                            if (element) {
                                const prevTextNode = element.previousSibling;
                                if (prevTextNode && prevTextNode.nodeType === Node.TEXT_NODE) {
                                    newParent.appendChild(prevTextNode);
                                }
                                newParent.appendChild(element);
                            }
                        });
                    }
                }
                boundary = buffer.indexOf('\n');
            }
        }

        this.transcript = transcriptContent.body.innerHTML;
        if (this.container) {
            this.container.innerHTML = this.transcript;
            this._saveHighlights(true);
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

    async clearMatches() {
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


export class PdfHighlight {
    rects: Rect[];
    height: number;
    centerY: number;

    constructor(rects: Rect[]) {
        this.rects = rects;
        this.height = rects[rects.length - 1].coordinates[0].y1 - rects[0].coordinates[0].y0;
        this.centerY = rects[0].coordinates[0].y0 - this.height / 2;
    }
}

export interface PdfHighlights extends Highlights {
    // variables
    highlights: PdfHighlight[];
    eventBus?: PdfJsViewer.EventBus;
    pdfViewer?: PdfJsViewer.PDFViewer;
    pdfAnnotationFactory?: AnnotationFactory;
    pdfData?: Uint8Array;
    pdfjsLib?: any;
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

    // functions
    findMatches = async () => {
        this.highlights = [];
        if (this.search().length <= 2) {
            await this.clearMatches();
        } else {
            let URL = process.env.VUE_APP_API_URL + `/meetings/${this.meetingId}/getHighlights?words=${this.search()}`;

            console.log(URL);
            if (this.language) URL += `&lang=${this.language}`;

            console.log(this.language);
            URL += `&looseSearch=true`;
            // TODO: add speaker to the URL
            // TODO: add looseSearch to the URL

            let response = undefined;
            try {
                response = await fetch(URL);
            } catch (error) {
                console.error('Request error:', error);
                return;
            }

            if (!response || !response.ok || !response.body) {
                console.error('Response not ok');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = '';

            while (true) {
                const {done, value} = await reader.read();

                if (done)
                    break;

                // Decode the chunk and add it to the buffer
                buffer += decoder.decode(value, {stream: true});

                // Process the complete JSON object from the buffer
                let boundary = buffer.indexOf('\n');


                while (boundary !== -1) {
                    const chunk = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 1);

                    if (chunk.trim()) {
                        let parsedChunk = undefined;
                        try {
                            parsedChunk = JSON.parse(chunk);
                        } catch (e) {
                            console.error("Error parsing chunk:", e);
                            continue;
                        }

                        const highlights: Highlight[] = parsedChunk.highlights;
                        console.log("Highlights", highlights.length);
                        for (const highlight of highlights) {

                            // invert the y coordinates in the highlight rectangles
                            for (const rect of highlight.rects) {
                                let page = rect.page;
                                let pages = this.pdfViewer?._pages;
                                if (!pages) continue;
                                let height = pages[page].viewport.viewBox[3];
                                rect.coordinates.forEach(coordinate => {
                                    coordinate.y0 = height - coordinate.y0;
                                    coordinate.y1 = height - coordinate.y1;
                                });
                            }

                            const rects = highlight.rects;

                            if (!rects || rects.length == 0 || !rects[0].coordinates) continue;

                            this.highlights.push(new PdfHighlight(rects));

                            for (const rect of rects) {
                                // Add the highlight to the PDF
                                let quadPoints = rect.coordinates.map(coordinate => {
                                    return [
                                        coordinate.x0, coordinate.y0,
                                        coordinate.x1, coordinate.y0,
                                        coordinate.x0, coordinate.y1,
                                        coordinate.x1, coordinate.y1
                                    ];
                                });

                                this.pdfAnnotationFactory?.createHighlightAnnotation(
                                    {
                                        page: rect.page,
                                        quadPoints: quadPoints.flat(),
                                        opacity: 0.5,
                                        color: {r: 255, g: 255, b: 0},
                                    },
                                );
                            }
                        }
                    }
                    boundary = buffer.indexOf('\n');
                }
            }
        }

        // sort the highlights by the page number and the y coordinate of the first rectangle (reverse order)
        this.highlights.sort((a, b) => {
            if (a.rects[0].page != b.rects[0].page) return a.rects[0].page - b.rects[0].page;
            return b.rects[0].coordinates[0].y0 - a.rects[0].coordinates[0].y0;
        });


        console.log("Preparing to set the document");
        await this.pdfjsLib.getDocument({
            data: this.pdfAnnotationFactory?.write().slice(0)
        }).promise.then(async (pdf: any) => {
            console.log("Setting document");
            this.pdfViewer?.setDocument(pdf);
            console.log("Document set");
        });

        this.total = this.highlights.length;

        console.log("Done");
        //this.touched = true;
    }

    onMatchesFound = (event: any) => {
        console.log("onMatchesFound", event);
        if (event.matchesCount.total == 0) {
            console.error('calling onMatchesFound with no matches, should not happen');
            return;
        }
        if (this.touched) {
            this.total = event.matchesCount.total;
            this.touched = false;
            //this._createPageMatches(event.source.pageMatches);
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

    clearMatches = async () => {
        this._reset();
        const existingAnnotations = await this.pdfAnnotationFactory?.getAnnotations();
        if (!existingAnnotations) return;
        const flattenedAnnotations = existingAnnotations.flat();
        if (flattenedAnnotations && flattenedAnnotations.length > 0) {
            const annotationIdsToDelete = flattenedAnnotations.map(annot => annot.id);
            const deletePromises = annotationIdsToDelete.map(annotationId => this.pdfAnnotationFactory?.deleteAnnotation(annotationId));
            await Promise.all(deletePromises);
        }
    }

    scrollToHighlight: () => void = () => {
        console.log("calling scrollToHighlight");
        let currentHighlight = this.highlights[this.index];
        let pageNumber = currentHighlight.rects[0].page;

        let scrollOffsetY = currentHighlight.centerY - this.pdfViewer!.container.clientHeight / 1.8;
        this.pdfViewer!.scrollPageIntoView({
            pageNumber: pageNumber, // the page number containing the highlight
            destArray: [null, {name: 'XYZ'}, 0, scrollOffsetY, null] // scroll to the calculated Y offset
        });
    }

    prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void = () => {
        console.log("prepHighlightBeforeScrolling not implemented");
    }

    nextHighlight = () => {
        this.index = (this.index + 1) % this.total;
        console.log(this.index);
        this._nextHighlight();
    }

    previousHighlight = () => {
        this.index = (this.index - 1 + this.total) % this.total;
        console.log(this.index);
        this._previousHighlight();
    }

    _nextHighlight: () => void = () => {
        console.log("Calling _nextHighlight");
        this.scrollToHighlight();
    }

    _previousHighlight: () => void = () => {
        console.log("Calling _previousHighlight");
        this.scrollToHighlight();
    }

    displayedHighlights = () => {
        console.log("Calling displayedHighlights");
        if (this.search().length <= 2) {
            return ""
        } else if (this.total == 0) {
            return "Ni zadetkov"
        } else {
            return `Zadetek ${this.index + 1} / ${this.total}`;
        }
    }
}