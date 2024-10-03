import { Module, MutationTree } from "vuex";
import { RootState } from "@/store/index";
import { MeetingSearchParams } from "@/types/MeetingSearchParams";
import { Attendee } from "@/types/Attendee";

interface MeetingSearchParamsState {
    instance: MeetingSearchParams;
}

const mutations: MutationTree<MeetingSearchParamsState> = {
    // Meeting search params
    resetSearchParams(state: MeetingSearchParamsState) {
        state.instance.reset()
    },
    updateMeetingId(state: MeetingSearchParamsState, meetingId: string) {
        state.instance.meetingId = meetingId
    },
    updateSearchWords(state: MeetingSearchParamsState, words: string) {
        state.instance.words = words
    },
    updateSearchSpeaker(state: MeetingSearchParamsState, speaker: Attendee | undefined) {
        state.instance.speaker = speaker
    },
    updateLang(state: MeetingSearchParamsState, lang: string) {
        state.instance.lang = lang
    },
    updateLooseSearch(state: MeetingSearchParamsState, looseSearch: boolean) {
        state.instance.looseSearch = looseSearch
    }
}

const meetingSearchParamsModule: Module<MeetingSearchParamsState, RootState> = {
    namespaced: true,
    state: {
        instance: MeetingSearchParams.create()
    },
    getters: {
        searchParamsInstance: (state) => state.instance
    },
    mutations
};

export default meetingSearchParamsModule;