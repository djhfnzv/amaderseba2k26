import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { SEX_LABEL, TIMING_LABEL } from "@/lib/prescriptions/constants";
import type { PrescriptionDetail } from "@/lib/prescriptions/queries";

const TEAL = "#0f766e";
const MUTED = "#64748b";
const INK = "#0f172a";
const LINE = "#cbd5e1";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 110, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: TEAL, paddingBottom: 10 },
  docName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: TEAL },
  small: { fontSize: 9, color: MUTED, marginTop: 2 },
  chamber: { width: 200, textAlign: "right", fontSize: 9, color: MUTED },
  patient: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 8, gap: 14 },
  label: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },
  body: { flexDirection: "row", flexGrow: 1, marginTop: 10 },
  left: { width: "34%", paddingRight: 12, borderRightWidth: 1, borderRightColor: LINE },
  right: { width: "66%", paddingLeft: 14 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEAL, textTransform: "uppercase", marginBottom: 3, marginTop: 10 },
  para: { lineHeight: 1.4 },
  rx: { fontSize: 22, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 6 },
  item: { marginBottom: 9 },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  itemMeta: { color: "#334155", marginTop: 2, paddingLeft: 14 },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 30,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  qr: { width: 62, height: 62 },
  banner: { padding: 6, marginTop: 8, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10 },
  watermark: {
    position: "absolute",
    top: 330,
    left: 70,
    fontSize: 90,
    color: "#e2e8f0",
    fontFamily: "Helvetica-Bold",
    transform: "rotate(-30deg)",
  },
});

function formatDay(iso: string | null, zone: string) {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : zone });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** One Text per line: react-pdf renders embedded newlines with extra gaps. */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split(/\r?\n/).map((line, i) => (
        <Text key={i} style={s.para}>
          {line || " "}
        </Text>
      ))}
    </>
  );
}

function PrescriptionPdf({ rx, qr, zone }: { rx: PrescriptionDetail; qr: string | null; zone: string }) {
  const draft = rx.status === "draft";
  const verifyUrl = rx.verify_code ? `${env.siteUrl.replace(/\/$/, "")}/verify/${rx.verify_code}` : null;
  return (
    <Document title={`Prescription ${rx.verify_code ?? "draft"} - ${rx.patient_name}`} author={rx.doctor_name ?? "MedLife"} creator="MedLife">
      <Page size="A4" style={s.page}>
        {draft && <Text style={s.watermark} fixed>DRAFT</Text>}

        <View style={s.header} fixed>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.docName}>{rx.doctor_name ?? "Doctor (details added on signing)"}</Text>
            {rx.doctor_degrees && <Text style={s.small}>{rx.doctor_degrees}</Text>}
            {rx.doctor_specialty && <Text style={s.small}>{rx.doctor_specialty}</Text>}
            {rx.doctor_license && <Text style={s.small}>Reg. No: {rx.doctor_license}</Text>}
          </View>
          <View style={s.chamber}>
            {rx.doctor_chamber && <Text>{rx.doctor_chamber}</Text>}
            {rx.is_online && <Text style={{ marginTop: 2 }}>Online consultation</Text>}
          </View>
        </View>

        {rx.status === "superseded" && (
          <Text style={[s.banner, { backgroundColor: "#fef3c7", color: "#92400e" }]}>
            This prescription was replaced by a newer version. Scan the QR code to see the current one.
          </Text>
        )}
        {draft && (
          <Text style={[s.banner, { backgroundColor: "#f1f5f9", color: MUTED }]}>Draft preview - not valid until signed</Text>
        )}

        <View style={s.patient}>
          <Text><Text style={s.label}>Name: </Text><Text style={s.bold}>{rx.patient_name || "-"}</Text></Text>
          {rx.patient_age && <Text><Text style={s.label}>Age: </Text>{rx.patient_age}</Text>}
          {rx.patient_sex && <Text><Text style={s.label}>Sex: </Text>{SEX_LABEL[rx.patient_sex]}</Text>}
          {rx.patient_weight && <Text><Text style={s.label}>Weight: </Text>{rx.patient_weight}</Text>}
          <Text><Text style={s.label}>Date: </Text>{formatDay(rx.signed_at ?? rx.updated_at, zone)}</Text>
        </View>

        <View style={s.body}>
          <View style={s.left}>
            {rx.chief_complaint && (
              <Section title="Chief complaints"><Lines text={rx.chief_complaint} /></Section>
            )}
            {rx.findings && (
              <Section title="On examination"><Lines text={rx.findings} /></Section>
            )}
            {rx.diagnosis && (
              <Section title="Diagnosis"><Lines text={rx.diagnosis} /></Section>
            )}
            {rx.tests.length > 0 && (
              <Section title="Investigations">
                {rx.tests.map((t) => (
                  <Text key={t.id} style={s.para}>
                    • {t.name}
                    {t.note ? ` (${t.note})` : ""}
                  </Text>
                ))}
              </Section>
            )}
          </View>

          <View style={s.right}>
            <Text style={s.rx}>Rx</Text>
            {rx.items.map((it, i) => (
              <View key={it.id} style={s.item} wrap={false}>
                <Text style={s.itemName}>
                  {i + 1}. {it.medicine_name}
                </Text>
                {it.generic_name && it.generic_name !== it.medicine_name && !it.medicine_name.includes(it.generic_name) && (
                  <Text style={[s.itemMeta, { color: MUTED }]}>{it.generic_name}</Text>
                )}
                <Text style={s.itemMeta}>
                  {[it.dose, it.timing ? TIMING_LABEL[it.timing] : null, it.duration].filter(Boolean).join("  ·  ")}
                </Text>
                {it.instructions && <Text style={[s.itemMeta, { color: MUTED }]}>{it.instructions}</Text>}
              </View>
            ))}
            {rx.items.length === 0 && <Text style={{ color: MUTED }}>No medicines prescribed.</Text>}

            {rx.advice && (
              <Section title="Advice"><Lines text={rx.advice} /></Section>
            )}
            {(rx.follow_up_date || rx.follow_up_note) && (
              <Section title="Follow-up">
                <Text style={s.para}>
                  {[rx.follow_up_date ? formatDay(rx.follow_up_date, zone) : null, rx.follow_up_note].filter(Boolean).join(" - ")}
                </Text>
              </Section>
            )}
          </View>
        </View>

        <View style={s.footer} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {qr && <Image src={qr} style={s.qr} />}
            <View>
              {rx.verify_code ? (
                <>
                  <Text style={s.bold}>Prescription ID: {rx.verify_code}</Text>
                  <Text style={s.small}>Scan to verify, or visit</Text>
                  <Text style={[s.small, { color: TEAL }]}>{verifyUrl}</Text>
                </>
              ) : (
                <Text style={s.small}>A verification QR code is added when the doctor signs.</Text>
              )}
              {rx.version > 1 && <Text style={s.small}>Version {rx.version}</Text>}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {rx.signed_at ? (
              <>
                <Text style={[s.bold, { color: TEAL }]}>Digitally signed</Text>
                <Text style={s.small}>{rx.doctor_name}</Text>
                <Text style={s.small}>
                  {new Date(rx.signed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: zone })}
                </Text>
              </>
            ) : (
              <Text style={s.small}>Not signed</Text>
            )}
            <Text style={[s.small, { fontSize: 7 }]} render={({ pageNumber, totalPages }) => `MedLife · Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPrescriptionPdf(rx: PrescriptionDetail, zone: string): Promise<Buffer> {
  const qr = rx.verify_code
    ? await QRCode.toDataURL(`${env.siteUrl.replace(/\/$/, "")}/verify/${rx.verify_code}`, { margin: 0, width: 240, errorCorrectionLevel: "M" })
    : null;
  return renderToBuffer(<PrescriptionPdf rx={rx} qr={qr} zone={zone} />);
}
