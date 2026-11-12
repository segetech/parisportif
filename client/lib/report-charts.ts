import JSZip from "jszip";

export interface NativeChart {
  sheetId: number; title: string; kind: "line" | "bar"; row: number; column?: number; width?: number; height?: number;
  categories: { formula: string; values: string[] };
  series: { name: string; formula: string; values: number[]; color: string }[];
  unit: string;
}
const xml = (value: unknown) => String(value).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const ns = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rich = (text: string) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:t>${xml(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
function chartXml(chart: NativeChart, chartId: number): string {
  const categoryAxis = chartId * 10 + 1, valueAxis = chartId * 10 + 2;
  const series = chart.series.map((s, index) => `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${xml(s.name)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></a:ln></c:spPr>${chart.kind === "line" ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : ""}<c:cat><c:strRef><c:f>${xml(chart.categories.formula)}</c:f><c:strCache><c:ptCount val="${chart.categories.values.length}"/>${chart.categories.values.map((v, i) => `<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(s.formula)}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${s.values.length}"/>${s.values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val>${chart.kind === "line" ? '<c:smooth val="0"/>' : ""}</c:ser>`).join("");
  const graph = chart.kind === "line" ? `<c:lineChart><c:grouping val="standard"/>${series}<c:axId val="${categoryAxis}"/><c:axId val="${valueAxis}"/></c:lineChart>` : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/><c:overlap val="0"/><c:axId val="${categoryAxis}"/><c:axId val="${valueAxis}"/></c:barChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace ${ns}><c:date1904 val="0"/><c:lang val="fr-FR"/><c:chart><c:title>${rich(chart.title)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${graph}<c:catAx><c:axId val="${categoryAxis}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valueAxis}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${valueAxis}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:title>${rich(chart.unit)}</c:title><c:numFmt formatCode="${chart.unit === "FCFA" ? "#,##0.00" : "0"}" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${categoryAxis}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>${chart.unit === "FCFA" ? "" : '<c:majorUnit val="1"/>'}</c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:externalData r:id="unused"/></c:chartSpace>`
    // No external workbook or network link: all references target this workbook.
    .replace('<c:externalData r:id="unused"/>', "");
}

/** Add standards-based editable charts to ExcelJS's otherwise complete workbook. */
export async function addNativeCharts(buffer: ArrayBuffer | Uint8Array, charts: NativeChart[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  let types = await zip.file("[Content_Types].xml")!.async("string");
  const grouped = new Map<number, { chart: NativeChart; id: number }[]>();
  charts.forEach((chart, i) => { const list = grouped.get(chart.sheetId) || []; list.push({ chart, id: i + 1 }); grouped.set(chart.sheetId, list); });
  for (const [sheetId, entries] of grouped) {
    let sheet = await zip.file(`xl/worksheets/sheet${sheetId}.xml`)!.async("string");
    if (sheet.includes("<drawing")) throw new Error("Une feuille contient déjà un dessin incompatible avec le rapport.");
    sheet = sheet.replace("</worksheet>", '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdReportDrawing"/></worksheet>');
    zip.file(`xl/worksheets/sheet${sheetId}.xml`, sheet);
    const relPath = `xl/worksheets/_rels/sheet${sheetId}.xml.rels`;
    const rel = zip.file(relPath) ? await zip.file(relPath)!.async("string") : '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    zip.file(relPath, rel.replace("</Relationships>", `<Relationship Id="rIdReportDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/report${sheetId}.xml"/></Relationships>`));
    const anchors = entries.map(({ chart, id }) => {
      zip.file(`xl/charts/report${id}.xml`, chartXml(chart, id));
      types = types.replace("</Types>", `<Override PartName="/xl/charts/report${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      const col = chart.column || 0, width = chart.width || 6, height = chart.height || 18;
      return `<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col + width}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.row + height}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${xml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }).join("");
    zip.file(`xl/drawings/report${sheetId}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/report${sheetId}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(({ id }) => `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/report${id}.xml"/>`).join("")}</Relationships>`);
    types = types.replace("</Types>", `<Override PartName="/xl/drawings/report${sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  zip.file("[Content_Types].xml", types);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
