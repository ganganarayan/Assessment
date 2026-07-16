// (No "server-only" pragma: the fs + @react-pdf/renderer imports already make this
// server-only de facto, and dropping it lets scripts/verify-report.ts render offline.)
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";

/**
 * Branded A4 band report (react-pdf). Consumes the STORED result only — no model
 * call, no scoring/band/AI logic — so every render for a submission is identical
 * bytes. Themed by band (green/yellow/orange/red). Flows to as many pages as the
 * content needs (full category breakdown with every question + the admin note).
 */

// ---- brand + per-band theme ----------------------------------------------
const GOLD = "#C8912B";
const INK = "#1f2d31";
const MUTE = "#5b6b70";
const LINE = "#dfe5e4";

// Per band LEVEL: `deep` = cover/heading/chip (dark enough for white text);
// `scale` = the bright bar colour. Stable→green, Strained→yellow(amber for
// legibility), Overwhelmed→orange, Critical→red.
const T_LOW = { deep: "#2E7D53", scale: "#3EA76B" };
const T_MED = { deep: "#9A7B12", scale: "#E6B92E" };
const T_HIGH = { deep: "#C4571F", scale: "#E8722E" };
const T_CRIT = { deep: "#9B2C2C", scale: "#C0392B" };
const DEFAULT_THEME = { deep: "#0E4C5C", scale: "#145E71" }; // fallback teal
const THEME: Record<string, { deep: string; scale: string }> = { LOW: T_LOW, MEDIUM: T_MED, HIGH: T_HIGH, CRITICAL: T_CRIT };
const BAND_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const BAND_SCALE_LABEL: Record<string, string> = { LOW: "Stable", MEDIUM: "Strained", HIGH: "Overwhelmed", CRITICAL: "Critical" };
const SCALE_SEGS = [T_LOW.scale, T_MED.scale, T_HIGH.scale, T_CRIT.scale];

/** Severity by a 0–100 share (higher share = more struggle, matching the engine). */
function tierScale(pct: number): string {
  if (pct < 40) return T_LOW.scale;
  if (pct < 60) return T_MED.scale;
  if (pct < 80) return T_HIGH.scale;
  return T_CRIT.scale;
}

/**
 * Optional per-band "next 15 days" copy. Left null on purpose — real brand-voice
 * copy is dropped in here later; until then the report shows the band's own stored
 * description (the participant's existing words), never improvised text.
 */
export const PRACTICE_BY_BAND: Record<string, string | null> = { LOW: null, MEDIUM: null, HIGH: null, CRITICAL: null };

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
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

// ---- data in --------------------------------------------------------------
export interface ReportCategory {
  name: string;
  score: number;
  max: number;
  band: string | null;
  questions: { text: string; answer: string | null; score: number; max: number }[];
}
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
  categories: ReportCategory[];
  /** Admin "Add to PDF" note — appended at the very bottom. */
  reportNote: string | null;
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 66, paddingHorizontal: 44, fontFamily: "Lato", fontSize: 10.5, color: INK, lineHeight: 1.5 },
  // Cover breaks out of the page padding to sit flush + full-bleed on page 1 only.
  cover: { marginTop: -34, marginHorizontal: -44, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 24 },
  goldRule: { height: 3, backgroundColor: GOLD, width: 70, marginBottom: 14 },
  coverKicker: { color: "#ffffffcc", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  coverTitle: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 30, marginTop: 2 },
  coverName: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 18, marginTop: 12 },
  coverMeta: { color: "#ffffffbb", fontSize: 10.5, marginTop: 8 },
  // Sections
  section: { marginTop: 18 },
  h2: { fontFamily: "Cormorant", fontSize: 17, marginBottom: 8 },
  p: { marginBottom: 8, textAlign: "justify" },
  // Band block
  bandRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  chipText: { color: "#ffffff", fontFamily: "Cormorant", fontSize: 20 },
  scoreBig: { fontFamily: "Cormorant", fontSize: 34, color: INK, textAlign: "right" },
  scoreCap: { fontSize: 9, color: MUTE, textAlign: "right" },
  // 4-band scale
  scaleWrap: { marginTop: 22, position: "relative" },
  scaleBar: { flexDirection: "row", height: 14, borderRadius: 3, overflow: "hidden" },
  scaleSeg: { flex: 1 },
  scaleLabels: { flexDirection: "row", marginTop: 4 },
  scaleLabel: { flex: 1, fontSize: 7.5, color: MUTE, textAlign: "center" },
  marker: { position: "absolute", top: -12, width: 1.5, height: 26, backgroundColor: INK },
  markerTag: { position: "absolute", top: -26, fontSize: 8, color: INK, fontWeight: "bold" },
  // Category breakdown
  catBlock: { marginTop: 12 },
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  catName: { fontSize: 11, fontWeight: "bold" },
  catScore: { fontSize: 10, color: MUTE },
  catTrack: { height: 8, backgroundColor: "#eef2f1", borderRadius: 3, overflow: "hidden", marginTop: 4, marginBottom: 6 },
  catFill: { height: 8, borderRadius: 3 },
  qRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 3 },
  qText: { flex: 1, fontSize: 9, color: "#3a4a4f" },
  qAns: { color: INK, fontWeight: "bold" },
  qScore: { fontSize: 9, color: MUTE, minWidth: 26, textAlign: "right" },
  // Footer
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
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
  const theme = THEME[level] ?? DEFAULT_THEME;
  const pct = Math.max(0, Math.min(100, Math.round(data.scorePercent)));
  const narrative = paragraphs(data.aiStatement);
  const practice = PRACTICE_BY_BAND[level] ?? data.resultSuggestion;
  const note = paragraphs(data.reportNote);

  return (
    <Document title={`Assess360 Report — ${data.name}`} author="Assess360">
      <Page size="A4" style={s.page}>
        {/* Cover — themed by band */}
        <View style={[s.cover, { backgroundColor: theme.deep }]}>
          <View style={s.goldRule} />
          <Text style={s.coverKicker}>Your Assess360 Report</Text>
          <Text style={s.coverTitle}>{data.assessmentTitle}</Text>
          <Text style={s.coverName}>{data.name}</Text>
          <Text style={s.coverMeta}>
            {data.profession ? `${data.profession}  ·  ` : ""}
            {data.dateIST}
          </Text>
        </View>

        {/* Band + score */}
        <View style={s.bandRow}>
          <View style={[s.chip, { backgroundColor: theme.deep }]}>
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
            {SCALE_SEGS.map((c, i) => (
              <View key={i} style={[s.scaleSeg, { backgroundColor: c }]} />
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
          <Text style={[s.h2, { color: theme.deep }]}>What your result means</Text>
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

        {/* Full category breakdown — every question, its answer, and its score */}
        {data.categories.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.h2, { color: theme.deep }]}>Category breakdown</Text>
            {data.categories.map((c, i) => {
              const cp = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
              return (
                <View key={i} style={s.catBlock} wrap={false}>
                  <View style={s.catHead}>
                    <Text style={s.catName}>
                      {i + 1}. {c.name}
                      {c.band ? `  —  ${c.band}` : ""}
                    </Text>
                    <Text style={s.catScore}>
                      {c.score}/{c.max}
                    </Text>
                  </View>
                  <View style={s.catTrack}>
                    <View style={[s.catFill, { width: `${cp}%`, backgroundColor: tierScale(cp) }]} />
                  </View>
                  {c.questions.map((q, j) => (
                    <View key={j} style={s.qRow}>
                      <Text style={s.qText}>
                        {q.text}
                        {q.answer ? <Text style={s.qAns}> — {q.answer}</Text> : null}
                      </Text>
                      <Text style={s.qScore}>
                        {q.score}/{q.max}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Band description / next steps */}
        {practice ? (
          <View style={s.section} wrap={false}>
            <Text style={[s.h2, { color: theme.deep }]}>Your next 15 days</Text>
            <Text style={s.p}>{practice}</Text>
            <Text style={[s.p, { color: MUTE }]}>
              Practise consistently for the next fifteen days, then take the assessment again to measure how far you have moved.
            </Text>
          </View>
        ) : null}

        {/* Admin "Add to PDF" note — the post-call action items / meeting summary */}
        {note.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.h2, { color: theme.deep }]}>Your action items</Text>
            {note.map((para, i) => (
              <Text key={i} style={s.p}>
                {para}
              </Text>
            ))}
          </View>
        ) : null}

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
