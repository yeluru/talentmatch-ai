/**
 * RTR (Right to Represent) form field config.
 * Order matches the placeholder order in CompSciPrep_RTR_Template.docx:
 * [_______________________] occurrences 1..N map to these fields in order.
 * Recruiter-filled = values from popup; candidate-fillable = left blank in DOCX, then added as PDF form fields.
 */

export type RTRFieldCoord = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RTRFieldDef = {
  key: string;
  label: string;
  recruiterFillable: boolean;
  /** For candidate fields: name of the PDF AcroForm text field and position (points, origin bottom-left). */
  pdfFormName?: string;
  pdfCoords?: RTRFieldCoord;
};

/** Ordered list: matches placeholder order in the template DOCX. */
export const RTR_FIELDS: RTRFieldDef[] = [
  { key: "sign_date", label: "Sign date (e.g. 6th day of February 2026)", recruiterFillable: true },
  { key: "candidate_name", label: "Candidate name", recruiterFillable: true },
  {
    key: "candidate_address",
    label: "Candidate address",
    recruiterFillable: false,
    pdfFormName: "candidate_address",
    pdfCoords: { pageIndex: 0, x: 72, y: 600, width: 300, height: 20 },
  },
  { key: "subcontractor", label: "Subcontractor (e.g. IBM-VRN)", recruiterFillable: true },
  { key: "client", label: "Client (e.g. IBM)", recruiterFillable: true },
  { key: "client_partner", label: "Client / partner name (e.g. APOLLO GLOBAL)", recruiterFillable: true },
  { key: "client_location", label: "Client location (e.g. Bryant Park - NYC)", recruiterFillable: true },
  { key: "rate", label: "Rate (e.g. $90 per hour)", recruiterFillable: true },
  { key: "position_title", label: "Position title (e.g. Middle Office Technical Consultant)", recruiterFillable: true },
];

export const RTR_RECRUITER_FIELDS = RTR_FIELDS.filter((f) => f.recruiterFillable);
export const RTR_CANDIDATE_FIELDS = RTR_FIELDS.filter((f) => !f.recruiterFillable);

export function getDefaultRtrFieldValue(
  key: string,
  context: { candidateName?: string; jobTitle?: string }
): string {
  switch (key) {
    case "candidate_name":
      return context.candidateName ?? "";
    case "position_title":
      return context.jobTitle ?? "";
    default:
      return "";
  }
}
