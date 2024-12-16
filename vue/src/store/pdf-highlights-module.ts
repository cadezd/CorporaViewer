import {Module, MutationTree} from "vuex";
import {RootState} from "@/store/index";
import {PdfHighlights} from "@/types/Highlights";
import * as PdfJsViewer from 'pdfjs-dist/web/pdf_viewer';
import {AnnotationFactory} from "annotpdf";

interface PdfHighlightsState {
    instance: PdfHighlights;
}

const mutations: MutationTree<PdfHighlightsState> = {
    async findMatches(state: PdfHighlightsState) {
        await state.instance.findMatches();
    },
    previousHighlight(state: PdfHighlightsState) {
        state.instance.previousHighlight();
    },
    nextHighlight(state: PdfHighlightsState) {
        state.instance.nextHighlight();
    },
    updateQuery(state: PdfHighlightsState, query: string) {
        state.instance.query = query;
    },
    updateMeetingId(state: PdfHighlightsState, meetingId: string | undefined) {
        state.instance.meetingId = meetingId;
    },
    updateLanguage(state: PdfHighlightsState, language: string | undefined) {
        state.instance.language = language;
    },
    updateSpeaker(state: PdfHighlightsState, speaker: string | undefined) {
        state.instance.speaker = speaker;
    },
    updateLooseSearch(state: PdfHighlightsState, looseSearch: boolean) {
        state.instance.looseSearch = looseSearch;
    },
    updateMatchesCount(state: PdfHighlightsState, event: any) {
        state.instance.onMatchesFound(event);
    },
    noMatches(state: PdfHighlightsState) {
        state.instance.onNoMatchesFound();
    },
    updateEventBus(state: PdfHighlightsState, eventBus: PdfJsViewer.EventBus) {
        state.instance.eventBus = eventBus;
    },
    updatePdfViewer(state: PdfHighlightsState, pdfViewer: PdfJsViewer.PDFViewer) {
        state.instance.pdfViewer = pdfViewer;
    },
    updatePdfJsLib(state: PdfHighlightsState, pdfjsLib: any) {
        state.instance.pdfjsLib = pdfjsLib;
    },
    updatePdfAnnotationFactory(state: PdfHighlightsState, pdfAnnotationFactory: AnnotationFactory | undefined) {
        state.instance.pdfAnnotationFactory = pdfAnnotationFactory;
    },
    updateOriginalPdfData(state: PdfHighlightsState, originalPdfData: Uint8Array) {
        state.instance.originalPdf = originalPdfData;
    },
    updateSource(state: PdfHighlightsState, source: any) {
        state.instance.source = source;
    },
    updateScrollToHighlight(state: PdfHighlightsState, scrollToHighlight: () => void) {
        state.instance.scrollToHighlight = scrollToHighlight;
    },
    updatePrepHighlightBeforeScrolling(state: PdfHighlightsState, prepHighlightBeforeScrolling: (performedAction: 'find' | 'resize' | 'next' | 'prev') => void) {
        state.instance.prepHighlightBeforeScrolling = prepHighlightBeforeScrolling;
    },
}

const pdfHighlightsModule: Module<PdfHighlightsState, RootState> = {
    namespaced: true,
    state: {
        instance: PdfHighlights.create()
    },
    getters: {
        pdfHighlightsInstance: (state) => state.instance
    },
    mutations
};

export default pdfHighlightsModule;