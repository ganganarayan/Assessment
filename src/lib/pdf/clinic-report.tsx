// (No "server-only" pragma — matches report.tsx: the fs + @react-pdf/renderer
// imports already make this server-only de facto, and dropping it lets a verify
// script render offline.)
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { type ClinicAuditResult } from "@/lib/scoring/clinic-audit";
import { formatINR, monthlyLabel, pctLabel } from "@/lib/format/inr";

/**
 * Divine Leads clinic-audit PDF — the SAME diagnosis as the web result page (money
 * figures + the author's band word + the AI prose), not the generic score/category
 * report (which is meaningless for clinic option values — they're rupees/rates, not
 * score points — and carries the wrong, unrelated brand footer).
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
  /** Author's Result Band title for this ₹-gap band (e.g. "Leaky Funnel"); null = none set. */
  bandLabel: string | null;
  bandNote: string | null;
  result: ClinicAuditResult;
  prose: string | null;
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Lato", fontSize: 10.5, color: INK, lineHeight: 1.5 },
  cover: { marginTop: -34, marginHorizontal: -44, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 24, backgroundColor: TEAL },
  goldRule: { height: 3, backgroundColor: GOLD, width: 70, marginBottom: 14 },
  coverKicker: { color: "#ffffffcc", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  coverTitle: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 26, marginTop: 2 },
  coverName: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 16, marginTop: 10 },
  coverMeta: { color: "#ffffffbb", fontSize: 10, marginTop: 6 },
  bandHead: { fontFamily: "Cormorant", fontSize: 24, color: GOLD, marginTop: 20 },
  bandNote: { fontSize: 11, color: MUTE, marginTop: 3 },
  figures: { flexDirection: "row", gap: 12, marginTop: 18 },
  fig: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  figCapToday: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: TEAL },
  figCapGap: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: GOLD },
  figCapFull: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTE },
  figAmt: { fontFamily: "Lato", fontWeight: "bold", fontSize: 15, marginTop: 4 },
  figAmtGap: { fontFamily: "Lato", fontWeight: "bold", fontSize: 18, color: GOLD, marginTop: 4 },
  figSub: { fontSize: 8, color: MUTE, marginTop: 2 },
  arith: { fontSize: 8.5, color: MUTE, backgroundColor: "#F7F5F0", borderRadius: 4, padding: 8, marginTop: 14 },
  section: { marginTop: 18 },
  h2: { fontFamily: "Cormorant", fontSize: 16, marginBottom: 6, color: TEAL },
  p: { marginBottom: 8, textAlign: "justify" },
  note: { fontSize: 9.5, color: MUTE, backgroundColor: "#F7F5F0", borderRadius: 4, padding: 8, marginTop: 8 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  footLine: { fontSize: 7.5, color: MUTE, textAlign: "center" },
});

function paragraphs(text: string | null): string[] {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#{2,3}\s*/, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function ClinicReport({ data }: { data: ClinicReportData }) {
  const r = data.result;
  const narrative = paragraphs(data.prose);

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

        {data.bandLabel ? (
          <>
            <Text style={s.bandHead}>{data.bandLabel}</Text>
            {data.bandNote ? <Text style={s.bandNote}>{data.bandNote}</Text> : null}
          </>
        ) : null}

        <View style={s.figures}>
          <View style={s.fig}>
            <Text style={s.figCapToday}>Earning today</Text>
            <Text style={s.figAmt}>{formatINR(r.revenueNow)}</Text>
            <Text style={s.figSub}>{r.casesNow} cases from {r.enquiries} enquiries</Text>
            <Text style={s.figSub}>{monthlyLabel(r.revenueNow)}</Text>
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

        <View style={s.arith}>
          <Text>
            {r.enquiries} enquiries × {pctLabel(r.bookRateNow)} booking × {pctLabel(r.showUpNow)} show-up × {pctLabel(r.closeRate)} close = {r.casesNow} cases × {formatINR(r.treatmentValue)} = {formatINR(r.revenueNow)}
          </Text>
          <Text style={{ marginTop: 4 }}>
            The same {r.enquiries} enquiries at {pctLabel(r.bookRateImproved)} booking and {pctLabel(r.showUpImproved)} show-up = {r.casesPotential} cases = {formatINR(r.revenuePotential)}
          </Text>
        </View>

        {r.assumptions.length > 0 ? (
          <Text style={s.note}>
            Figures assumed (answer was &quot;I don&apos;t know&quot;) for: {r.assumptions.join(", ")}. Correct these on the interactive result page.
          </Text>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>What five more cases a month would take</Text>
          <Text style={s.p}>
            At your own close rate, held constant: {r.fiveCases.attended} consultations attended,{" "}
            {r.fiveCases.booked} booked, {r.fiveCases.enquiries} enquiries, roughly {formatINR(r.fiveCases.adSpend)}{" "}
            in ad spend.
          </Text>
        </View>

        {r.dormant.recoverable > 0 ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Already sitting in your clinic</Text>
            <Text style={s.p}>
              About {r.dormant.recoverable} cases ({formatINR(r.dormant.value)}) are recoverable from the dormant
              enquiries you already hold — no ad spend required.
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
