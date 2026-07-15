// (No "server-only" pragma: the fs + @react-pdf/renderer imports already make this
// server-only de facto, and dropping it lets scripts/verify-report.ts render offline.)
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

/**
 * Branded A4 band report (react-pdf). Consumes the STORED result only — no model
 * call, no scoring/band/AI logic — so every render for a submission is identical
 * bytes. Fonts are read from disk once at module load into data-URIs (no network
 * fetch during render, which would be a flaky-build vector).
 */

// ---- brand + band palette -------------------------------------------------
const TEAL = "#0E4C5C";
const GOLD = "#C8912B";
const INK = "#1f2d31";
const MUTE = "#5b6b70";
const LINE = "#dfe5e4";

// Colour by overall band LEVEL (stable 4-tier key; titles vary per assessment).
const SAGE = "#3E7C6B"; // Stable
const GOLD_B = "#C8912B";
const CORAL = "#D4593B";
const RED = "#8E2F2F";
const BAND_COLOR: Record<string, string> = { LOW: SAGE, MEDIUM: GOLD_B, HIGH: CORAL, CRITICAL: RED };
const BAND_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const BAND_SCALE_LABEL: Record<string, string> = { LOW: "Stable", MEDIUM: "Building", HIGH: "Strained", CRITICAL: "Critical" };

/** Severity by a 0–100 share (higher share = more struggle, matching the engine). */
function tierColor(pct: number): string {
  if (pct < 40) return SAGE;
  if (pct < 60) return GOLD_B;
  if (pct < 80) return CORAL;
  return RED;
}

/**
 * Optional per-band "next 15 days" copy. Left null on purpose — real brand-voice
 * copy is dropped in here later; until then the report shows the band's own stored
 * description (the participant's existing words), never improvised text.
 */
export const PRACTICE_BY_BAND: Record<string, string | null> = {
  LOW: null,
  MEDIUM: null,
  HIGH: null,
  CRITICAL: null,
};

// ---- fonts (disk -> data URI, once) ---------------------------------------
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
  Font.registerHyphenationCallback((word) => [word]); // never hyphenate mid-word
  fontsReady = true;
}

// ---- data in --------------------------------------------------------------
export interface ReportData {
  name: string;
  profession: string | null;
  assessmentTitle: string;
  dateIST: string;
  scorePercent: number;
  bandTitle: string | null;
  bandLevel: string | null; // LOW | MEDIUM | HIGH | CRITICAL
  aiStatement: string | null;
  resultSuggestion: string | null;
  categories: { name: string; score: number; max: number; band: string | null }[];
}

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 64, fontFamily: "Lato", fontSize: 10.5, color: INK, lineHeight: 1.5 },
  body: { paddingHorizontal: 44 },
  // Cover
  cover: { backgroundColor: TEAL, paddingHorizontal: 44, paddingTop: 34, paddingBottom: 26 },
  goldRule: { height: 3, backgroundColor: GOLD, width: 70, marginBottom: 14 },
  coverKicker: { color: GOLD, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  coverTitle: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 30, marginTop: 2 },
  coverMeta: { color: "#cfe0e2", fontSize: 10.5, marginTop: 10 },
  coverName: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 18, marginTop: 12 },
  // Sections
  section: { marginTop: 20 },
  h2: { fontFamily: "Cormorant", fontSize: 17, color: TEAL, marginBottom: 8 },
  p: { marginBottom: 8, textAlign: "justify" },
  // Band block
  bandRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  chipText: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 20 },
  scoreBig: { fontFamily: "Cormorant", fontSize: 34, color: INK, marginLeft: "auto" },
  scoreCap: { fontSize: 9, color: MUTE, textAlign: "right" },
  // 4-band scale
  scaleWrap: { marginTop: 22, position: "relative" },
  scaleBar: { flexDirection: "row", height: 14, borderRadius: 3, overflow: "hidden" },
  scaleSeg: { flex: 1 },
  scaleLabels: { flexDirection: "row", marginTop: 4 },
  scaleLabel: { flex: 1, fontSize: 7.5, color: MUTE, textAlign: "center" },
  marker: { position: "absolute", top: -12, width: 1.5, height: 26, backgroundColor: INK },
  markerTag: { position: "absolute", top: -26, fontSize: 8, color: INK, fontWeight: "bold" },
  // Domain bars
  domRow: { marginBottom: 10 },
  domHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  domName: { fontSize: 10 },
  domScore: { fontSize: 9, color: MUTE },
  domTrack: { height: 9, backgroundColor: "#eef2f1", borderRadius: 3, overflow: "hidden" },
  domFill: { height: 9, borderRadius: 3 },
  // Footer
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  footLine: { fontSize: 7.5, color: MUTE, textAlign: "center" },
  disclaimer: { fontSize: 7.5, color: MUTE, textAlign: "center", marginTop: 2 },
});

function paragraphs(text: string | null): string[] {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footLine}>
        Ganga Narayan Das — the monk-engineer teaching the Bhagavad Gita as applied neuroscience for executives
      </Text>
      <Text style={s.footLine}>applygitawisdom.com · connect@applygitawisdom.com</Text>
      <Text style={s.disclaimer}>This is an indicative self-assessment, not a clinical diagnosis.</Text>
    </View>
  );
}

function AssessmentReport({ data }: { data: ReportData }) {
  const level = (data.bandLevel ?? "").toUpperCase();
  const bandColor = BAND_COLOR[level] ?? GOLD;
  const pct = Math.max(0, Math.min(100, Math.round(data.scorePercent)));
  const narrative = paragraphs(data.aiStatement);
  // Per-band override copy if provided, else the band's own stored description.
  const practice = PRACTICE_BY_BAND[level] ?? data.resultSuggestion;

  return (
    <Document title={`Assess360 Report — ${data.name}`} author="Assess360">
      <Page size="A4" style={s.page}>
        {/* Cover */}
        <View style={s.cover}>
          <View style={s.goldRule} />
          <Text style={s.coverKicker}>Your Assess360 Report</Text>
          <Text style={s.coverTitle}>{data.assessmentTitle}</Text>
          <Text style={s.coverName}>{data.name}</Text>
          <Text style={s.coverMeta}>
            {data.profession ? `${data.profession}  ·  ` : ""}
            {data.dateIST}
          </Text>
        </View>

        <View style={s.body}>
          {/* Band + score */}
          <View style={s.bandRow}>
            <View style={[s.chip, { backgroundColor: bandColor }]}>
              <Text style={s.chipText}>{data.bandTitle ?? "Result"}</Text>
            </View>
            <View style={{ marginLeft: "auto" }}>
              <Text style={s.scoreBig}>{pct}%</Text>
              <Text style={s.scoreCap}>overall</Text>
            </View>
          </View>

          {/* 4-band scale (position + order encode severity, not colour alone) */}
          <View style={s.scaleWrap}>
            <View style={s.scaleBar}>
              {BAND_ORDER.map((lv) => (
                <View key={lv} style={[s.scaleSeg, { backgroundColor: BAND_COLOR[lv] }]} />
              ))}
            </View>
            <View style={s.scaleLabels}>
              {BAND_ORDER.map((lv) => (
                <Text key={lv} style={s.scaleLabel}>
                  {BAND_SCALE_LABEL[lv]}
                </Text>
              ))}
            </View>
            <Text style={[s.markerTag, { left: `${Math.max(0, Math.min(88, pct - 4))}%` }]}>You {pct}%</Text>
            <View style={[s.marker, { left: `${pct}%` }]} />
          </View>

          {/* AI narrative */}
          <View style={s.section}>
            <Text style={s.h2}>What your result means</Text>
            {narrative.length > 0 ? (
              narrative.map((para, i) => (
                <Text key={i} style={s.p}>
                  {para}
                </Text>
              ))
            ) : (
              <Text style={s.p}>{data.resultSuggestion ?? "Your personalised summary will appear here."}</Text>
            )}
          </View>

          {/* Domain breakdown */}
          {data.categories.length > 0 ? (
            <View style={s.section} wrap={false}>
              <Text style={s.h2}>Where it shows up</Text>
              {data.categories.map((c, i) => {
                const cp = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
                return (
                  <View key={i} style={s.domRow}>
                    <View style={s.domHead}>
                      <Text style={s.domName}>
                        {c.name}
                        {c.band ? `  ·  ${c.band}` : ""}
                      </Text>
                      <Text style={s.domScore}>
                        {c.score}/{c.max}
                      </Text>
                    </View>
                    <View style={s.domTrack}>
                      <View style={[s.domFill, { width: `${cp}%`, backgroundColor: tierColor(cp) }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Band description / next steps */}
          {practice ? (
            <View style={s.section} wrap={false}>
              <Text style={s.h2}>Your next 15 days</Text>
              <Text style={s.p}>{practice}</Text>
              <Text style={[s.p, { color: MUTE }]}>
                Practise consistently for the next fifteen days, then take the assessment again to measure how far you have moved.
              </Text>
            </View>
          ) : null}
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

/** Render the report to a PDF Buffer. Deterministic for a given ReportData. */
export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<AssessmentReport data={data} />);
}
