<template>
  <!-- Toolbar -->
  <div class="toolbar-container">
    <!-- Toolbar title -->
    <div class="title">
      <h3><strong>{{ $t('toolbar') }}</strong></h3>
    </div>

    <!-- Toggle between original PDF and transcript -->
    <div class="toolbar-control-container">
      <div class="toolbar-label">
        <h5>{{ $t('show') }}</h5>
      </div>
      <div class="toolbar-content">
        <select class="input-field" v-model="show">
          <option value="pdf" id="choosePdfOption">{{ $t('originalDocument') }}</option>
          <option value="transcript">{{ $t('transcript') }}</option>
        </select>
      </div>
    </div>

    <!-- Language selection -->
    <div class="toolbar-control-container" v-if="show === 'transcript'">
      <div class="toolbar-label">
        <h5>{{ $t('transcriptLanguage') }}</h5>
      </div>
      <div class="toolbar-content">
        <select class="input-field" v-model="transcriptLanguage">
          <option value="">{{ $t('dontTranslate') }}</option>
          <option value="sl">{{ $t('sl') }}</option>
          <option value="de">{{ $t('de') }}</option>
        </select>
      </div>
    </div>

    <!-- Search bar -->
    <div class="toolbar-control-container">
      <div class="toolbar-label">
        <h5>{{ $t('textSearch') }}</h5>
      </div>
      <div class="toolbar-content">
        <Typeahead :placeholder="$t('textSearchPlaceholder')" :list="searchedWordsList" :displayFn="wordDisplayFn"
                   :emptyItem="''" :getter="getWordsToHighlight" @selectedChange="handleWordSelected"
                   @searchChange="handleSearchChanged"/>
        <div class="content-search-buttons">
          <div class="btn btn-primary content-search-button" @click="previousHighlightClick()"
               v-if="showNextPrevHighlightButtons()">
            <i class="fas fa-arrow-left"></i>
          </div>
          <div class="btn btn-primary content-search-button" @click="nextHighlightClick()"
               v-if="showNextPrevHighlightButtons()">
            <i class="fas fa-arrow-right"></i>
          </div>
        </div>
        <div class="highlight-text-info" v-if="show === 'pdf'">
          {{
            pdfHighlightsInstance.displayedHighlights()
          }}
        </div>
        <div class="highlight-text-info" v-if="show === 'transcript'">
          {{
            getTranscriptHighlights()
          }}
        </div>
      </div>
    </div>

    <!-- TODO: dodaj izbiro govornikov -->
    <!-- TODO: dodaj izbiro za "loose Search" -->

    <!-- Search info -->
    <div class="toolbar-tooltip">
      <button class="btn btn-primary btn-tooltip" @click="toggleTooltip" :class="{ 'btn-disabled': showTooltip }">
        <i class="fas fa-info-circle"></i>
      </button>
      <div class="tooltip-text" :class="{ 'tooltip-hidden': !showTooltip }">
        <button class="btn btn-primary hide-button" @click="toggleTooltip"><i class="fas fa-eye-slash"></i></button>
        <p>{{ $t('tooltip') }}</p>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-control-container" v-if="show === 'pdf'">
      <button class="btn btn-primary pagination-button" @click="documentPagination.previousPage()"
              :disabled="!documentPagination.hasPreviousPage()" :class="{ 'button-disbled': matchLoading }">
        <i class="fas fa-arrow-left"></i>
      </button>
      <div class="pagination">
        <span class="max-pages">{{ $t('page') }}&nbsp;&nbsp;</span>
        <input type="number" class="page-input" v-model="pageInput" :min="1" :max="documentPagination.total"
               @keyup.enter="applyPageInput()" @blur="applyPageInput()" :class="{ 'button-disbled': matchLoading }">
        <span class="max-pages">/ {{ documentPagination.total() }}</span>
      </div>
      <button class="btn btn-primary pagination-button" @click="documentPagination.nextPage()"
              :disabled="!documentPagination.hasNextPage()">
        <i class="fas fa-arrow-right"></i>
      </button>
    </div>

  </div>
  <!-- PDF / transcript container -->
  <div class="pdf-viewer-container">

    <!-- Display of original document -->
    <PdfDisplay v-if="show === 'pdf'" :class="{ 'blur': loading || matchLoading, 'scrollable': show === 'pdf' }"
                v-bind:meeting_id="meeting_id" v-bind:matchLoading="matchLoading" @loaded="handlePdfLoaded"
                @matchLoaded="handleMatchLoaded"
                @loadingNewMatch="newMatchLoading" @loading="handlePdfLoading"
                @executeInitialSearch="executeInitialSearch"></PdfDisplay>
    <!-- Display of transcript -->
    <Transcript v-else :class="{ 'blur': loading, 'scrollable': show === 'transcript' }">
    </Transcript>
    <!-- Display of loading whell -->
    <div class="loading-container" v-if="loading || matchLoading">
      <div class="spinner-border" role="status">
        <span class="sr-only">{{ $t('loading') }}</span>
      </div>
    </div>
  </div>
</template>

<style>

.toolbar-tooltip {
  transition: all 0.3s ease-in-out;
  display: grid;
}

.btn-tooltip, .tooltip-text {
  grid-column: 1;
  grid-row: 1;
}

.btn-tooltip {
  display: flex;
  padding: 0.8rem;
  margin: 1rem;
  background-color: #708d81;
  color: #f0f7ee;
  border: none;
  border-radius: 50px;
  z-index: 2;
  width: fit-content;
  height: fit-content;
  transition: all 0.2s ease-in-out;
}

.tooltip-text {
  padding: 1rem;
  text-align: justify;
  position: relative;
  margin: 0 0.5rem;
  background-color: #708d81;
  color: #f0f7ee;
  border-radius: 10px;
  z-index: 1;
  opacity: 1;
  transition: all 0.2s ease-in-out;
}

.tooltip-text p {
  padding-top: 0.3rem;
  border-top: #f0f7ee 3px solid;
}

.tooltip-hidden {
  display: none;
}

.btn-disabled {
  pointer-events: none;
  opacity: 0;
}

.hide-button {
  display: flex;
  padding: 0.8rem;
  border-radius: 20px;
  margin-bottom: 0.5rem;
}


.title {
  margin: 0.5rem;
  padding: 0.5rem 0 0.2rem 0;
  color: #708d81;
}

.pdf-viewer-container {
  display: flex;
  height: fit-content;
}

.content-search-buttons {
  margin: 0.5rem;
  display: flex;
  justify-content: space-between;
}

.content-search-button {
  margin: 0 0.5rem;
  flex: 1;
}

.highlight-text-info {
  margin: 0 0.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.pdf-container {
  position: absolute;
  width: 70%;
  left: 1vw;
  margin: 1rem auto 0 auto;
  background-color: #f0f7ee;
  border-radius: 5px !important;
  overflow: hidden;
  scroll-behavior: smooth;
}

.page {
  border: none !important;
  margin: 1rem auto !important;
}

.transcript-container {
  width: 70%;
  height: 0vh;
  position: absolute;
  left: 1vw;
  margin: 1rem auto 0 auto;
  border: 5px solid #f0f7ee;
  background-color: #f0f7ee;
  border-radius: 10px !important;
  overflow-y: hidden;
  padding: 2rem;
}

.scrollable {
  height: 89vh;
  overflow: scroll;
  border-top: 10px solid #f0f7ee;
  border-bottom: 10px solid #f0f7ee;
}

.toolbar-container {
  width: 27%;
  height: 89vh;
  position: absolute;
  right: 0;
  margin: 1rem;
  border-radius: 10px;
  background-color: #f0f7ee;
  transition: all 0.2s ease-in-out;
}

.toolbar-content {
  background-color: #f0f7ee;
  padding: 0.5rem;
  border: #708d81 4px solid;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
}

.toolbar-label {
  background-color: #708d81;
  color: #f0f7ee;
  padding-top: 0.7rem;
  padding-bottom: 0.1rem;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loading-text {
  position: absolute;
  top: 50%;
  left: calc(50% - 10rem);
}

select {
  width: 100%;
}

.toolbar-control-container {
  margin: 0.5rem;
  width: calc(100% - 1rem);
}

.pagination-control-container {
  margin: 0.5rem;
  padding: 0.5rem 0 0.2rem 0;
  border-radius: 10px;
  background-color: #708d81;
  color: #f0f7ee;
  position: absolute;
  display: flex;
  justify-content: space-between;
  bottom: 0;
  right: 0;
  width: calc(100% - 1rem);
}

.page-input {
  width: 2rem;
  padding-bottom: 2px;
  border: none !important;
  border-bottom: #f0f7ee 2px solid !important;
  background-color: transparent !important;
  color: #f0f7ee !important;
  font-size: larger;
  text-align: center;
  transition: all 0.2s ease-in-out;
}

.page-input:focus {
  border-radius: 5px;
  background-color: #1e1e2440 !important;
  border-bottom: transparent 2px solid !important;
  box-shadow: 0px !important;
  outline: none !important;
}

.max-pages {
  color: #f0f7ee;
  font-size: larger;
}

.pagination {
  display: flex;
  align-items: center;
}

.pagination-button {
  margin: 0 0.5rem;
}

input:focus {
  outline: none;
}

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.highlight {
  background-color: rgba(255, 0, 0) !important;
}

.current-selected-highlight {
  background-color: rgba(255, 0, 255) !important;
}

.blur > * {
  filter: blur(20px);
}

.blur {
  overflow-y: hidden !important;

}

.btn-disabled:hover {
  pointer-events: none;
  background-color: #708d81 !important;
  color: #f0f7ee !important;
}

.loading-container {
  position: absolute;
  top: 50%;
  left: calc(75vw * 0.5);
}

@media (max-width: 1350px) {
  .transcript-container {
    position: absolute;
    margin: 1rem;
    left: 0;
    width: fit-content;
    height: unset;
    border-radius: 10px;
  }

  .toolbar-container {
    all: unset;
    background-color: #f0f7ee;
    border-radius: 10px;
    position: sticky;
    top: 0;
    left: 0;
    height: fit-content;
    margin: 1rem;
    z-index: 5;
    display: grid;
    transition: all 0.2s ease-in-out;
  }

  .toolbar-container > * {
    flex: 1;
  }

  .toolbar-container * {
    font-size: 1rem;
  }

  .pdf-container {
    left: 0;
    width: calc(100% - 2rem);
    margin: 1rem;
  }

  .scrollable {
    height: 70vh;
  }

  .pagination-control-container {
    position: static;
  }

  .transparent {
    background-color: transparent !important;
  }

  .language-control {
    display: flex;
    flex-direction: column;
  }

  .language-control > .toolbar-content {
    padding: 0.8rem !important;
    flex: 1;
  }

  .language-control > .toolbar-content > .input-field {
    padding-bottom: 0.5rem !important;
    padding-left: 0.5rem !important;
  }
}

</style>

<script lang="ts">
import Typeahead from '@/components/Typeahead.vue';
import PdfDisplay from '@/components/PdfDisplay.vue';
import Transcript from '@/components/Transcript.vue';
import 'pdfjs-dist/build/pdf.worker.entry';
import 'pdfjs-dist/web/pdf_viewer.css';
import * as pdfjs from 'pdfjs-dist';
import {AnnotationFactory} from 'annotpdf';
import {Options, Vue} from 'vue-class-component';
import {Watch} from 'vue-property-decorator';
import {mapGetters, mapMutations} from 'vuex';
import {useDebounceFn} from '@vueuse/core'
import axios from 'axios';
import {SearchParams} from '@/types/SearchParams';
import {PdfHighlights, TranscriptHighlights} from '@/types/Highlights';
import {Pagination} from '@/types/Pagination';

@Options({
  props: {
    meeting_id: {
      type: String,
      required: true
    },
  },
  components: {
    Typeahead,
    PdfDisplay,
    Transcript
  },
  computed: {
    ...mapGetters('searchParamsModule', ['searchParamsInstance']),
    ...mapGetters('transcriptHighlightsModule', ['transcriptHighlightsInstance']),
    ...mapGetters('pdfHighlightsModule', ['pdfHighlightsInstance']),
    ...mapGetters('documentPaginationModule', ['documentPaginationInstance']),
  },
  methods: {
    ...mapMutations(['findMatches', 'nextHighlight', 'previousHighlight', 'updateSearch', 'updateMeetingId', 'updateLanguage',]),
    ...mapMutations('searchParamsModule', ['']),
    ...mapMutations('transcriptHighlightsModule', ['updateOriginalTranscript', 'setUpdateTranscriptIndex', 'setUpdateTranscriptTotal',]),
    ...mapMutations('pdfHighlightsModule', ['updatePdfAnnotationFactory']),
    ...mapMutations('documentPaginationModule', ['setPage', 'updatePageInputFunctions'])
  }
})

export default class PdfView extends Vue {
  [x: string]: any;

  get searchParams(): SearchParams {
    return this.searchParamsInstance;
  }

  get transcriptHighlights(): TranscriptHighlights {
    return this.transcriptHighlightsInstance;
  }

  get pdfHighlights(): PdfHighlights {
    return this.pdfHighlightsInstance;
  }

  get documentPagination(): Pagination {
    return this.documentPaginationInstance;
  }

  meeting_id?: string;
  transcriptLanguage: string = '';
  searchedWordsList: string[] = [];
  firstLoad: boolean = false;

  show: string = ''
  loading: boolean = false;
  matchLoading: boolean = false;
  nextMatchTimeout?: number;

  wordsToHighlight: string = '';
  pageInput: number = 1;
  windowWidth: number = window.innerWidth;
  scrollHeight: number = 0;

  transcriptIndex: number = 0;
  transcriptTotal: number = 0;

  showTooltip: boolean = false;

  mounted(): void {
    this.handlePdfLoading();
    this.show = 'pdf';

    window.addEventListener('resize', () => {
      this.windowWidth = window.innerWidth;
      this.documentPagination.setPage(this.documentPagination.getPage());
    });

    window.addEventListener('scroll', () => {
      this.scrollHeight = window.scrollY;
    });

    this.firstLoad = true;

    this.initStoreParams();

    this.parseSearchList();

    this.getPDF();
    this.getTranscript();
  }

  unmounted(): void {
    window.removeEventListener('resize', () => {
      this.windowWidth = window.innerWidth;
    });

    window.removeEventListener('scroll', () => {
      this.scrollHeight = window.scrollY;
    });

    this.updateSearch('');
    this.updateMeetingId(undefined);
    this.updateLanguage(undefined);
    this.updatePdfAnnotationFactory(undefined);
    this.pdfHighlights.highlights = [];
    this.documentPagination.total = () => 1
  }

  handlePdfLoading() {
    this.loading = true;
    this.matchLoading = true;
  }

  handlePdfLoaded() {
    this.loading = false;
    this.matchLoading = false;
  }

  handleMatchLoaded() {
    this.matchLoading = false;
    this.nextMatchTimeout && clearTimeout(this.nextMatchTimeout);
  }

  initialTranscriptSearchCallback() {
    if (this.firstLoad) {
      this.firstLoad = false;
      this.executeInitialSearch();
    }
  }

  @Watch('wordsToHighlight') onWordsToHighlightChange() {
    if (this.wordsToHighlight.length > 2 && this.windowAllowsPdfDisplay()) {
      this.newMatchLoading();
    }
    if (this.windowAllowsPdfDisplay()) this.findMatches(this.wordsToHighlight);
    else this.transcriptHighlights.findMatches();
  }

  @Watch('transcriptLanguage') onTranscriptLanguageChanged() {
    this.getTranscript();
    this.updateLanguage(this.transcriptLanguage ? this.transcriptLanguage : undefined);
  }

  @Watch('show') onShowChanged() {
    if (this.show === 'pdf') {
      if (this.pdfHighlights.total === 0) {
        this.documentPagination.syncPdfToTranscriptScroll();
      } else if (this.transcriptHighlights.total === 0) {
        this.findMatches(this.wordsToHighlight);
      } else {
        this.pdfHighlights.refreshHighlights();
      }
    }

    // switching to transcript logic is implemented in transcript container
  }

  getPDF() {
    this.loading = true;
    pdfjs.getDocument({
      url: process.env.VUE_APP_API_URL + '/pdf/getById/' + this.meeting_id
    }).promise.then(async (pdf: pdfjs.PDFDocumentProxy) => {
      pdf.getData().then((data: Uint8Array) => {
        this.updatePdfAnnotationFactory(new AnnotationFactory(data));
      });
    }).catch((error: any) => {
      console.log(error)
    });
  }

  getTranscript() {
    // get meeting as text with meeting_id and transcriptLanguage
    axios.get(process.env.VUE_APP_API_URL + `/meetings/${this.meeting_id}/getMeetingAsText`, {
      params: {
        lang: this.transcriptLanguage,
        pageLang: this.$i18n.locale
      }
    }).then((response) => {
      this.loading = false;
      this.updateOriginalTranscript({
        text: response.data.text,
        callback: !this.windowAllowsPdfDisplay() ? this.initialTranscriptSearchCallback : () => {
        }
      });
    }).catch((error) => {
      console.log(error)
    })
  }

  applyPageInput() {
    this.setPage(this.pageInput);
  }

  getPageInput(): number {
    return this.pageInput;
  }

  setPageInput(newPageInput: number) {
    if (this.pageInput !== newPageInput) {
      this.pageInput = newPageInput;
    }
  }

  getWordsToHighlight(): string {
    // replace all non characters (except dot, quotes and slovenian characters) with space, then remove all double spaces
    return this.wordsToHighlight.trim();
  }

  initStoreParams(): void {
    this.updatePageInputFunctions({
      getPageInput: this.getPageInput,
      setPageInput: this.setPageInput
    });
    this.updateSearch(this.getWordsToHighlight);
    this.updateMeetingId(this.meeting_id)

    this.setUpdateTranscriptIndex(this.updateTranscriptIndex);
    this.setUpdateTranscriptTotal(this.updateTranscriptTotal);
  }

  // HIGHLIGHT FUNCTIONS
  wordDisplayFn(word: string) {
    return word;
  }

  handleWordSelected = useDebounceFn((word: string) => {
    this.wordsToHighlight = word;
  }, 1000);


  handleSearchChanged = useDebounceFn((search: string) => {
    this.wordsToHighlight = search;
  }, 1000);

  showNextPrevHighlightButtons() {
    if (this.show === 'pdf')
      return this.pdfHighlights.total > 1 && this.wordsToHighlight !== '';
    else
      return this.transcriptHighlights.total > 1;
  }

  matchChangeButtonDisabled() {
    return this.matchLoading;
  }

  newMatchLoading() {
    this.matchLoading = true;

    this.nextMatchTimeout = setTimeout(() => {
      this.matchLoading = false;
    }, 4000);
  }

  parseSearchList() {
    this.searchedWordsList = [];
    if ((this.searchParams.words ?? "") !== "") {
      // remove or and double spaces
      let searchWords = this.searchParams.words.replace("OR", "").replace(/\s+/g, " ").trim();

      // push all phrases inside "" as one string and remove them from words
      let phrases = searchWords.match(/"[^"]*"/g) ?? [];
      for (const phrase of phrases) {
        this.searchedWordsList.push(phrase.replace(/"/g, ""));
        searchWords = searchWords.replace(phrase, "");
      }
      // push all words left
      this.searchedWordsList.push(...searchWords.split(" "));
    }
    if (this.searchParams.place) {
      for (const [key, value] of Object.entries(this.searchParams.place.names)) {
        console.log(key, value);
        if (value !== "" && value !== 'zzzzz')
          this.searchedWordsList.push(value);
      }
    }
    // TODO: add speakers
  }

  executeInitialSearch() {
    this.firstLoad = false;

    let firstQuery = this.searchParams.words.replaceAll("AND", "OR").replaceAll(/\"|\'/g, "") ?? "";
    // firstQuery += this.searchParams.place?.names ? " " + Object.values(this.searchParams.place?.names).filter(name => name !== 'zzzzz').join(" ") : "";
    // firstQuery += this.searchParams.speaker ? " " + this.searchParams.speaker?.names.join(" ") : "";

    this.wordsToHighlight = firstQuery.trim();
  }

  previousHighlightClick() {
    if (!this.matchChangeButtonDisabled()) this.previousHighlight(this.show === 'pdf');
  }

  nextHighlightClick() {
    if (!this.matchChangeButtonDisabled()) this.nextHighlight(this.show === 'pdf');
  }

  getTranscriptHighlights() {
    if (this.wordsToHighlight.length <= 2) {
      return ""
    } else if (this.transcriptTotal == 0) {
      return "Ni zadetkov"
    } else {
      return `Zadetek ${this.transcriptIndex + 1} / ${this.transcriptTotal}`;
    }
  }

  updateTranscriptIndex(index: number) {
    this.transcriptIndex = index;
  }

  updateTranscriptTotal(total: number) {
    this.transcriptTotal = total;
  }

  windowAllowsPdfDisplay() {
    return true
  }

  /*
  transparentBackground() {
    return this.scrollHeight / window.innerHeight > 0.2;
  }
   */

  toggleTooltip() {
    this.showTooltip = !this.showTooltip;
  }
}
</script>