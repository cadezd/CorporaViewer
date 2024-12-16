const express = require("express");
const router = express.Router();
const esClient = require("../../services/elasticsearch");

const poslanciController = require("../controllers/poslanciController");
const krajevnaImenaController = require("../controllers/krajevnaImenaController");
const meetingsController = require("../controllers/meetingsController");
const pdfController = require("../controllers/pdfController");

router.get("/poslanci/getAll", poslanciController.getAll);

router.get("/krajevnaImena/getAll", krajevnaImenaController.getAll);

router.get("/meetings/:meetingId/getMeetingAsText", meetingsController.getMeetingAsText);
router.get("/meetings/getPage/:page", meetingsController.getPage);
router.get("/meetings/:meetingId/getHighlights", meetingsController.getHighlights);
router.get("/meetings/:meetingId/getSpeakers", meetingsController.getSpeakers);

router.get("/pdf/getById/:id", pdfController.getById);
router.get("/pdf/getThumbnailById/:id", pdfController.getThumbnailById);

module.exports = router;
