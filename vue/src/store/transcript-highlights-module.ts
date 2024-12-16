import {Module, MutationTree} from "vuex";
import {RootState} from "@/store/index";
import {TranscriptHighlights} from "@/types/Highlights";

interface TranscriptHighlightsState {
    instance: TranscriptHighlights;
}

const mutations: MutationTree<TranscriptHighlightsState> = {
    async findMatches(state: TranscriptHighlightsState) {
        await state.instance.findMatches();
    },
    previousHighlight(state: TranscriptHighlightsState) {
        state.instance.previousHighlight();
    },
    nextHighlight(state: TranscriptHighlightsState) {
        state.instance.nextHighlight();
    },
    updateQuery(state: TranscriptHighlightsState, query: string) {
        state.instance.query = query;
    },
    updateMeetingId(state: TranscriptHighlightsState, meetingId: string | undefined) {
        state.instance.meetingId = meetingId;
    },
    updateLanguage(state: TranscriptHighlightsState, language: string | undefined) {
        state.instance.language = language;
    },
    updateSpeaker(state: TranscriptHighlightsState, speaker: string | undefined) {
        state.instance.speaker = speaker;
    },
    updateLooseSearch(state: TranscriptHighlightsState, looseSearch: boolean) {
        state.instance.looseSearch = looseSearch;
    },
    async updateOriginalTranscript(state: TranscriptHighlightsState, params: { text: string, callback: () => void }) {
        state.instance.originalTranscript = params.text;
        params.callback();
        await state.instance.findMatches();
    },
    updateContainer(state: TranscriptHighlightsState, container: HTMLDivElement) {
        state.instance.container = container;
    },
    setUpdateTranscriptIndex(state: TranscriptHighlightsState, updateTranscriptIndex: (index: number) => void) {
        state.instance.updateTranscriptIndex = updateTranscriptIndex;
    },
    setUpdateTranscriptTotal(state: TranscriptHighlightsState, updateTranscriptTotal: (total: number) => void) {
        state.instance.updateTranscriptTotal = updateTranscriptTotal;
    }
}

const transcriptHighlightsModule: Module<TranscriptHighlightsState, RootState> = {
    namespaced: true,
    state: {
        instance: TranscriptHighlights.create()
    },
    getters: {
        transcriptHighlightsInstance: (state) => state.instance
    },
    mutations
};

export default transcriptHighlightsModule;