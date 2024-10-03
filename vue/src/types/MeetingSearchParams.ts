import {reactive} from "vue";
import {Attendee} from "./Attendee";

export interface MeetingSearchParamsInterface {
    meetingId?: string;
    words?: string;
    speaker?: Attendee;
    lang?: string;
    looseSearch?: boolean;
}

export class MeetingSearchParams implements MeetingSearchParamsInterface {

    static create(): MeetingSearchParams {
        return reactive(new MeetingSearchParams()) as MeetingSearchParams;
    }

    meetingId: string = "";
    words: string = "";
    speaker?: Attendee;
    lang?: string;
    looseSearch?: boolean = false;

    reset(): void {
        this.meetingId = "";
        this.words = "";
        this.speaker = undefined;
        this.lang = undefined;
        this.looseSearch = false;
    }
}