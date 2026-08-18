// (No "server-only" pragma — matches report.tsx: the fs + @react-pdf/renderer
// imports already make this server-only de facto, and dropping it lets a verify
// script render offline.)
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { type ClinicAuditResult } from "@/lib/scoring/clinic-audit";
import { fmtStep, caseLine, buildTrail, assumedTagText, roundPatients, roundedRevenue } from "@/lib/scoring/clinic-trail";
import { formatINR, pctLabel } from "@/lib/format/inr";

/**
 * Divine Leads clinic-audit PDF. Renders the EXACT same calculation trail as the
 * web result page (clinic-audit-result.tsx) — same shared helpers from
 * lib/scoring/clinic-trail.ts, same figures, same "assumed" tags — so the two can
 * never show different numbers for the same submission. No band headline (dropped
 * from the web page too — the calculation speaks for itself); no generic score/
 * category report (meaningless for clinic option values, which are rupees/rates,
 * not score points).
 */

const INK = "#0E3540";
const TEAL = "#134E5A";
const GOLD = "#B8913F";
const MUTE = "#5C6E73";
const LINE = "#DCD6C9";

const FONT_DIR = join(process.cwd(), "src", "lib", "pdf", "fonts");
const asDataUri = (file: string): string =>
  `data:font/ttf;base64,${readFileSync(join(FONT_DIR, file)).toString("base64")}`;

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  Font.register({ family: "Cormorant", src: asDataUri("CormorantGaramond-SemiBold.ttf") });
  Font.register({
    family: "Lato",
    fonts: [
      { src: asDataUri("Lato-Regular.ttf") },
      { src: asDataUri("Lato-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export interface ClinicReportData {
  name: string;
  profession: string | null;
  assessmentTitle: string;
  dateIST: string;
  result: ClinicAuditResult;
  prose: string | null;
  bookingUrl: string | null;
  /** ₹ per enquiry used for the five-case ad-spend chain (from the engine config). */
  costPerEnquiry: number;
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Lato", fontSize: 10.5, color: INK, lineHeight: 1.5 },
  cover: { marginTop: -34, marginHorizontal: -44, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 24, backgroundColor: TEAL },
  goldRule: { height: 3, backgroundColor: GOLD, width: 70, marginBottom: 14 },
  coverKicker: { color: "#ffffffcc", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  coverTitle: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 26, marginTop: 2 },
  coverName: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 16, marginTop: 10 },
  coverMeta: { color: "#ffffffbb", fontSize: 10, marginTop: 6 },
  figures: { flexDirection: "row", gap: 12, marginTop: 20 },
  fig: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  figCapToday: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: TEAL },
  figCapGap: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: GOLD },
  figCapFull: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTE },
  figAmt: { fontFamily: "Lato", fontWeight: "bold", fontSize: 15, marginTop: 4 },
  figAmtGap: { fontFamily: "Lato", fontWeight: "bold", fontSize: 18, color: GOLD, marginTop: 4 },
  figSub: { fontSize: 8, color: MUTE, marginTop: 2 },
  calc: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10, marginTop: 14 },
  calcTitle: { fontSize: 9, fontWeight: "bold", textTransform: "uppercase", color: TEAL, marginBottom: 5 },
  calcTitlePot: { fontSize: 9, fontWeight: "bold", textTransform: "uppercase", color: GOLD, marginBottom: 5 },
  calcRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottomWidth: 1, borderBottomColor: LINE, fontSize: 9 },
  calcRowLast: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, fontSize: 9 },
  calcLabel: { color: MUTE, maxWidth: "62%" },
  calcVal: { fontFamily: "Lato" },
  calcValRevenue: { fontFamily: "Lato", fontWeight: "bold", color: TEAL },
  calcValRevenuePot: { fontFamily: "Lato", fontWeight: "bold", color: GOLD },
  // No italic — only Lato Regular/Bold are registered (react-pdf can't synthesize
  // italic; requesting it throws "Could not resolve font" at render time).
  assumedTag: { fontSize: 7.5, color: GOLD },
  section: { marginTop: 18 },
  h2: { fontFamily: "Cormorant", fontSize: 16, marginBottom: 6, color: TEAL },
  p: { marginBottom: 8, textAlign: "justify" },
  note: { fontSize: 9.5, color: MUTE, backgroundColor: "#F7F5F0", borderRadius: 4, padding: 8, marginTop: 8 },
  cta: { marginTop: 8, fontSize: 10, color: TEAL },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  footLine: { fontSize: 7.5, color: MUTE, textAlign: "center" },
});

function paragraphs(text: string | null): string[] {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#{2,3}\s*/, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** One calculation-trail row: label (+ optional assumed tag) on the left, the
 *  computed value on the right. `last` drops the bottom border. */
function CalcRow({
  label,
  tag,
  value,
  last,
  valueStyle,
}: {
  label: string;
  tag?: string | null;
  value: string;
  last?: boolean;
  valueStyle?: typeof s.calcVal;
}) {
  return (
    <View style={last ? s.calcRowLast : s.calcRow}>
      <Text style={s.calcLabel}>
        {label}
        {tag ? <Text style={s.assumedTag}> ({tag})</Text> : null}
      </Text>
      <Text style={valueStyle ?? s.calcVal}>{value}</Text>
    </View>
  );
}

function ClinicReport({ data }: { data: ClinicReportData }) {
  const r = data.result;
  const narrative = paragraphs(data.prose);

  const eTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "ENQUIRIES", "monthly enquiries", false);
  const bTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "BOOK_RATE", "booking rate", false);
  const sTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "SHOWUP_RATE", "show-up rate", false);
  const cTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "CLOSE_RATE", "close rate", false);
  const vTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "TREATMENT_VALUE", "treatment value", false);
  const dTag = assumedTagText(r.assumptions, r.assumedRangeLabel, "DORMANT", "dormant list size", false);

  const todayTrail = buildTrail(r.enquiries, r.bookRateNow, r.showUpNow, r.closeRate);
  const potTrail = buildTrail(r.enquiries, r.bookRateImproved, r.showUpImproved, r.closeRate);
  const caseToday = caseLine(todayTrail.cases);
  const casePot = caseLine(potTrail.cases);
  const pmTrail = buildTrail(r.performance.enquiries, r.bookRateImproved, r.showUpImproved, r.closeRate);
  const caseTodayLabel = `${caseToday.text} patient${caseToday.text === "1" ? "" : "s"}/month${caseToday.hint ? ` (${caseToday.hint})` : ""}`;
  const casePotLabel = `${casePot.text} patient${casePot.text === "1" ? "" : "s"}/month${casePot.hint ? ` (${casePot.hint})` : ""}`;

  return (
    <Document title={`Patient Acquisition Audit — ${data.name}`} author="Assess360">
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <View style={s.goldRule} />
          <Text style={s.coverKicker}>Patient Acquisition Audit</Text>
          <Text style={s.coverTitle}>{data.assessmentTitle}</Text>
          <Text style={s.coverName}>{data.name}</Text>
          <Text style={s.coverMeta}>
            {data.profession ? `${data.profession}  ·  ` : ""}
            {data.dateIST}
          </Text>
        </View>

        {r.dataInconsistent ? (
          <Text style={s.note}>
            These answers don&apos;t describe a working clinic — they compute to under one
            completed treatment a month, so a figure was almost certainly entered in the wrong
            scale (for a question asking &quot;out of every 10&quot;, answering 7 means 70%, not
            7%). The figures below are shown for reference only and should not be relied on until
            the audit is retaken with corrected numbers.
          </Text>
        ) : null}

        <View style={s.figures}>
          <View style={s.fig}>
            <Text style={s.figCapToday}>Earning today</Text>
            <Text style={s.figAmt}>{formatINR(r.revenueNow)}</Text>
            <Text style={s.figSub}>{r.casesNow} cases from {r.enquiries} enquiries</Text>
            <Text style={s.figSub}>{formatINR(r.revenueNow * 12)} a year</Text>
          </View>
          <View style={s.fig}>
            <Text style={s.figCapGap}>Lost in the gap</Text>
            <Text style={s.figAmtGap}>{formatINR(r.gap)}</Text>
            <Text style={s.figSub}>{Math.max(0, r.casesPotential - r.casesNow)} cases never reached</Text>
            <Text style={s.figSub}>{formatINR(r.annualGap)} a year</Text>
          </View>
          <View style={s.fig}>
            <Text style={s.figCapFull}>Full potential</Text>
            <Text style={s.figAmt}>{formatINR(r.revenuePotential)}</Text>
            <Text style={s.figSub}>{r.casesPotential} cases at the same close rate</Text>
          </View>
        </View>

        {/* Full calculation trail — identical to the web page, stage by stage. */}
        <View style={s.calc}>
          <Text style={s.calcTitle}>Today — how we got this number</Text>
          <CalcRow label="Monthly enquiries" tag={eTag} value={fmtStep(r.enquiries)} />
          <CalcRow label={`× Booking rate (${pctLabel(r.bookRateNow)})`} tag={bTag} value={`= ${fmtStep(todayTrail.booked)} booked`} />
          <CalcRow label={`× Show-up rate (${pctLabel(r.showUpNow)})`} tag={sTag} value={`= ${fmtStep(todayTrail.attended)} attended`} />
          <CalcRow label={`× Close rate (${pctLabel(r.closeRate)})`} tag={cTag} value={`= ${caseTodayLabel}`} />
          <CalcRow
            label={`× Treatment value (${formatINR(r.treatmentValue)})`}
            tag={vTag}
            value={`= ${formatINR(r.revenueNow)}/month`}
            valueStyle={s.calcValRevenue}
          />
          <CalcRow
            label="In whole patients"
            value={`${roundPatients(todayTrail.cases)} patient${roundPatients(todayTrail.cases) === 1 ? "" : "s"}/month = ${formatINR(roundedRevenue(todayTrail.cases, r.treatmentValue))}/month`}
            last
          />
        </View>

        <View style={s.calc}>
          <Text style={s.calcTitlePot}>Achievable — fixing response speed &amp; follow-up</Text>
          <CalcRow label="Monthly enquiries (same)" value={fmtStep(r.enquiries)} />
          <CalcRow label={`× Booking rate (${pctLabel(r.bookRateImproved)})`} value={`= ${fmtStep(potTrail.booked)} booked`} />
          <CalcRow label={`× Show-up rate (${pctLabel(r.showUpImproved)})`} value={`= ${fmtStep(potTrail.attended)} attended`} />
          <CalcRow label={`× Close rate (${pctLabel(r.closeRate)}, unchanged — never modelled as improving)`} value={`= ${casePotLabel}`} />
          <CalcRow
            label={`× Treatment value (${formatINR(r.treatmentValue)})`}
            value={`= ${formatINR(r.revenuePotential)}/month`}
            valueStyle={s.calcValRevenuePot}
          />
          <CalcRow
            label="In whole patients"
            value={`${roundPatients(potTrail.cases)} patient${roundPatients(potTrail.cases) === 1 ? "" : "s"}/month = ${formatINR(roundedRevenue(potTrail.cases, r.treatmentValue))}/month`}
            last
          />
        </View>

        {r.assumptions.length > 0 ? (
          <Text style={s.note}>
            Figures marked &quot;assumed&quot; were used because no exact number was given — the
            midpoint of the selected range was used instead. Editable on the interactive result page.
          </Text>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>With performance marketing</Text>
          <Text style={s.p}>
            On an ad budget of {formatINR(r.performance.adBudget)} a month, at{" "}
            {formatINR(data.costPerEnquiry)} per enquiry — converted at the improved booking and
            show-up rates, and your own close rate, unchanged.
          </Text>
          <View style={s.calc}>
            <CalcRow label="Ad budget" value={`${formatINR(r.performance.adBudget)}/month`} />
            <CalcRow label={`÷ Cost per enquiry (${formatINR(data.costPerEnquiry)})`} value={`= ${fmtStep(r.performance.enquiries)} new enquiries`} />
            <CalcRow label={`× Booking rate (${pctLabel(r.bookRateImproved)})`} value={`= ${fmtStep(pmTrail.booked)} booked`} />
            <CalcRow label={`× Show-up rate (${pctLabel(r.showUpImproved)})`} value={`= ${fmtStep(pmTrail.attended)} attended`} />
            <CalcRow label={`× Close rate (${pctLabel(r.closeRate)}, unchanged)`} value={`= ${fmtStep(pmTrail.cases)} patients/month`} />
            <CalcRow
              label={`× Treatment value (${formatINR(r.treatmentValue)})`}
              value={`= ${formatINR(r.performance.revenue)}/month`}
              valueStyle={s.calcValRevenuePot}
            />
            <CalcRow
              label="In whole patients"
              value={`${roundPatients(pmTrail.cases)} patients/month = ${formatINR(roundedRevenue(pmTrail.cases, r.treatmentValue))}/month`}
              last
            />
          </View>
          <Text style={[s.p, { marginTop: 8 }]}>
            This is additional — over and above what your clinic earns today.
          </Text>
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Where this leaves you</Text>
          <Text style={s.p}>
            The same clinic at each stage — your enquiries today, the same enquiries with the
            follow-up system working, then with performance marketing added on top.
          </Text>
          <View style={s.calc}>
            <CalcRow label="Today" value={`${formatINR(r.revenueNow)}/month`} />
            <CalcRow label="With the follow-up system working (same enquiries)" value={`${formatINR(r.revenuePotential)}/month`} valueStyle={s.calcValRevenue} />
            <CalcRow label={`+ performance marketing (${formatINR(r.performance.adBudget)} ads)`} value={`${formatINR(r.performance.combinedRevenue)}/month`} valueStyle={s.calcValRevenuePot} />
            <CalcRow label="− Performance marketing fee" value={`− ${formatINR(r.performance.serviceFee)}/month`} />
            <CalcRow label="− Ad budget" value={`− ${formatINR(r.performance.adBudget)}/month`} />
            <CalcRow label="= What you keep" value={`${formatINR(r.performance.netTotal)}/month`} valueStyle={s.calcValRevenue} last />
          </View>
          {r.performance.netGain > 0 ? (
            <Text style={[s.p, { marginTop: 8 }]}>
              You put in {formatINR(r.performance.investment)} a month and end up{" "}
              {formatINR(r.performance.netGain)} a month ahead of where you are today.
            </Text>
          ) : null}
        </View>

        {r.dormant.recoverable > 0 ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Already sitting in your clinic</Text>
            <Text style={s.p}>
              About {r.dormant.recoverable} cases ({formatINR(r.dormant.value)})
              {dTag ? ` (${dTag})` : ""} are recoverable from the dormant enquiries you already hold —
              no ad spend required.
            </Text>
          </View>
        ) : null}

        {narrative.length > 0 ? (
          <View style={s.section}>
            <Text style={s.h2}>The diagnosis</Text>
            {narrative.map((para, i) => (
              <Text key={i} style={s.p}>{para}</Text>
            ))}
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Talk it through</Text>
          <Text style={s.p}>Book a 1-on-1 video call with our expert to walk through these numbers for your clinic.</Text>
          {data.bookingUrl ? <Text style={s.cta}>{data.bookingUrl}</Text> : null}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footLine}>Patient Acquisition Audit — Assess360</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render the clinic PDF to a Buffer. Deterministic for a given ClinicReportData. */
export async function renderClinicReportPdf(data: ClinicReportData): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<ClinicReport data={data} />);
}
