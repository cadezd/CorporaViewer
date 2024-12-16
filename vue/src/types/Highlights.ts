import * as PdfJsViewer from 'pdfjs-dist/web/pdf_viewer';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer';
import {reactive} from 'vue';
import {Highlight} from "@/types/Highlight";
import {AnnotationFactory} from 'annotpdf';
import {Rect} from "@/types/Rect";

export abstract class HighlightsAbstract {

    // variables
    meetingId?: string;
    query: string = "";
    language?: string;
    speaker?: string;
    looseSearch: boolean = false;
    index?: number;
    touched?: boolean;
    total?: number;

    /**
     * Generator function to stream responses from fetch calls.
     *
     * @param {Function} fetchcall - The fetch call to make. Should return a response with a readable body stream.
     * @returns {AsyncGenerator<string>} An async generator that yields strings from the response stream.
     */
    async* streamingFetch(fetchcall: Function): AsyncIterableIterator<any> {

        const response = await fetchcall();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        while (true) {
            // wait for next encoded chunk
            const {done, value} = await reader.read();
            // check if stream is done
            if (done) break;

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
                        // Yield the parsed chunk
                        yield parsedChunk;
                    } catch (e) {
                        console.error("Error parsing chunk:", e);
                        continue;
                    }
                }
                boundary = buffer.indexOf('\n');
            }
        }
    }

    // functions
    abstract findMatches: () => void;
    abstract clearMatches: () => void;
    abstract scrollToHighlight: (...params: any) => void;
    abstract nextHighlight: () => void;
    abstract previousHighlight: () => void;
}

// -----------------------------
// Transcript highlights
// -----------------------------

export abstract class TranscriptHighlightsAbstract extends HighlightsAbstract {
    // variables
    highlights?: NodeListOf<Element>;
    container?: HTMLDivElement;
    transcript?: string;
    originalTranscript?: string;

    // functions
    abstract applyTranscript: () => void;

    // callbacks
    abstract updateTranscriptIndex: (index: number) => void;
    abstract updateTranscriptTotal: (total: number) => void;
}

export class TranscriptHighlights extends TranscriptHighlightsAbstract {

    static create(): TranscriptHighlights {
        return reactive(new TranscriptHighlights()) as TranscriptHighlights;
    }

    touched: boolean = false;
    index: number = -1;
    total: number = 0;
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

        if (this.query!.length <= 2 && !this.speaker)
            return;

        let transcriptContent = new DOMParser().parseFromString(this.transcript, 'text/html');

        let URL = process.env.VUE_APP_API_URL + `/meetings/${this.meetingId}/getHighlights?words=${this.query}`;
        if (this.language)
            URL += `&lang=${this.language}`;
        if (this.speaker)
            URL += `&speaker=${this.speaker}`;
        if (this.looseSearch)
            URL += `&looseSearch=true`;

        for await (const parsedChunk of super.streamingFetch(() => fetch(URL))) {
            const highlights: Highlight[] = parsedChunk.highlights;
            for (const highlight of highlights) {

                const firstId = highlight.ids[0];
                const firstChild = transcriptContent.getElementById(firstId);
                if (!firstChild) {
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
            highlight.scrollIntoView({block: 'center'});
        }
    }

    clearMatches = async () => {
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
        } else {
            console.error("container not defined");
        }
    }
}

// -----------------------------
// PDF highlights
// -----------------------------


export class PdfHighlight {
    id: string;
    rects: Rect[];
    centerY: number;

    constructor(id: string, rects: Rect[]) {
        this.id = id;
        this.rects = rects;
        this.centerY = rects[0].coordinates[0].y0
    }
}

export abstract class PdfHighlightsAbstract extends HighlightsAbstract {
    // variables
    highlights: PdfHighlight[] = [];
    eventBus?: PdfJsViewer.EventBus;
    pdfViewer?: PdfJsViewer.PDFViewer;
    pdfAnnotationFactory?: AnnotationFactory;
    pdfjsLib?: any;
    source?: any;

    // functions
    abstract onMatchesFound: (event: any) => void;
    abstract onNoMatchesFound: () => void;
    abstract refreshHighlights: () => void;
    abstract displayedHighlights: () => string;

    // callbacks
    abstract scrollToHighlight: () => void;
    abstract prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void;

}

export class PdfHighlights extends PdfHighlightsAbstract {

    static create(): PdfHighlights {
        return reactive(new PdfHighlights()) as PdfHighlights;
    }

    // variables
    touched: boolean = false;
    index: number = -1;
    total: number = 0;
    eventBus?: PdfJsViewer.EventBus = undefined;
    pdfViewer?: PdfJsViewer.PDFViewer = undefined;
    pdfAnnotationFactory?: AnnotationFactory = undefined;
    originalPdf?: Uint8Array = undefined;

    updateIndexChanges(index: number) {
        this.index = index;
    }

    updateTotalChanges(total: number) {
        this.total = total;
    }

    findMatches = async () => {
        await this.clearMatches();

        if (this.query!.length > 2 || this.speaker !== undefined) {
            let URL = process.env.VUE_APP_API_URL + `/meetings/${this.meetingId}/getHighlights?words=${this.query}`;
            if (this.speaker)
                URL += `&speaker=${this.speaker}`;
            if (this.looseSearch)
                URL += `&looseSearch=true`;

            for await (const parsedChunk of super.streamingFetch(() => fetch(URL))) {
                const highlights: Highlight[] = parsedChunk.highlights;
                for (const highlight of highlights) {
                    const rects = highlight.rects;
                    if (!rects || rects.length == 0 || !rects[0].coordinates) continue;
                    // invert the y coordinates in the highlight rectangles
                    for (const rect of highlight.rects) {
                        let page = rect.page;
                        let height = this.pdfViewer?._pages![page].viewport.viewBox[3];
                        rect.coordinates.forEach(coordinate => {
                            coordinate.y0 = height - coordinate.y0;
                            coordinate.y1 = height - coordinate.y1;
                        });
                    }
                    this.highlights.push(new PdfHighlight(highlight.ids[0], rects));
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

            // sort the highlights by their id
            this.highlights.sort((a: PdfHighlight, b: PdfHighlight) => {
                return a.id.localeCompare(b.id, undefined, {numeric: true});
            });
        }

        if (this.pdfAnnotationFactory) {
            this.displayPdf(true);
        }
    }

    displayPdf = (shouldScrollToHighlight: boolean) => {
        this.eventBus!.on("pagesinit", () => {
            if (this.highlights && this.highlights.length > 0) {
                // scroll to the first highlight
                this.updateIndexChanges(0);
                this.updateTotalChanges(this.highlights.length);
                if (shouldScrollToHighlight) {
                    this.scrollToHighlight();
                }
            }
        });

        this.pdfjsLib.getDocument({
            data: this.pdfAnnotationFactory!.write().slice(0)
        }).promise.then((pdf: any) => {
            this.pdfViewer!.setDocument(pdf);
            this.touched = true;
        });
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
        if (!this.highlights || this.highlights!.length === 0)
            return;

        const currentHighlight = this.highlights[this.index];
        const pageNumber = currentHighlight.rects[0].page;
        const containerHeight = this.pdfViewer!._pages![pageNumber].viewport.viewBox[3];
        const centerOffsetY = currentHighlight.centerY + containerHeight / 6;

        this.pdfViewer!.scrollPageIntoView({
            pageNumber: pageNumber + 1,
            destArray: [null, {name: "XYZ"}, 0, centerOffsetY, null],
            allowNegativeOffset: true
        });
    }

    prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void = () => {
        console.log("prepHighlightBeforeScrolling not implemented");
    }

    nextHighlight = () => {
        this.updateIndexChanges((this.index + 1) % this.total);
        this.scrollToHighlight();
    }

    previousHighlight = () => {
        this.updateIndexChanges((this.index - 1 + this.total) % this.total);
        this.scrollToHighlight();
    }

    displayedHighlights = () => {
        if (this.query!.length <= 2 && this.speaker === undefined) {
            return ""
        } else if (this.total == 0) {
            return "Ni zadetkov"
        } else {
            return `Zadetek ${this.index + 1} / ${this.total}`;
        }
    }
}