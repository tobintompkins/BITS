import Decimal from "decimal.js";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { formatMoney } from "@/lib/money/decimal";

/**
 * Renders contribution-statement PDF bytes from an already-validated snapshot.
 * This module returns bytes only. Saving the file, creating or publishing a
 * ContributionStatement row, and portal visibility are later reviewed patches.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_TOP = 42;
const LINE_GAP = 3;
const DARK = rgb(0.05, 0.05, 0.05);
const RULE = rgb(0.55, 0.55, 0.55);

export type ContributionStatementPdfAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
};

export type ContributionStatementPdfLine = {
  offeringDate: Date;
  fundName: string;
  deductibleAmount: string;
};

export type ContributionStatementPdfSnapshot = {
  statementType: "INDIVIDUAL" | "HOUSEHOLD";
  statementIdentifier: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  locale?: string;
  organization: {
    name: string;
    address: ContributionStatementPdfAddress;
  };
  recipient: {
    name: string;
    address: ContributionStatementPdfAddress;
  };
  lines: ContributionStatementPdfLine[];
  deductibleTotal: string;
  footerText: string;
};

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function asPlainText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function pdfSafeText(value: string, font: PDFFont) {
  let output = "";
  for (const character of asPlainText(value)) {
    try {
      font.encodeText(character);
      output += character;
    } catch {
      output += "?";
    }
  }
  return output;
}

export function formatStatementPdfMoney(amount: string, locale = "en-US") {
  try {
    const value = new Decimal(amount).toFixed(2);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(Number(value));
  } catch {
    return formatMoney(amount);
  }
}

export function formatStatementPdfDate(value: Date, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export function formatStatementPdfAddress(
  address: ContributionStatementPdfAddress,
) {
  const cityLine = [address.city, address.state]
    .filter((part) => present(part))
    .join(", ");
  const cityStatePostal = present(address.postalCode)
    ? `${cityLine} ${address.postalCode}`.trim()
    : cityLine;
  const country =
    present(address.country) && address.country?.trim().toUpperCase() !== "US"
      ? address.country?.trim()
      : null;
  return [address.line1, address.line2, cityStatePostal, country]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const safe = pdfSafeText(text, font);
  const paragraphs = safe.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const character of word) {
        const next = chunk + character;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = character;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
  }
  return lines;
}

type DrawContext = {
  document: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  locale: string;
  identifier: string;
  generatedAt: Date;
};

function drawPageFooter(ctx: DrawContext) {
  const generated = formatStatementPdfDate(ctx.generatedAt, ctx.locale);
  const footer = pdfSafeText(
    `${ctx.identifier}  -  Generated ${generated}`,
    ctx.font,
  );
  ctx.page.drawLine({
    start: { x: MARGIN, y: FOOTER_TOP + 14 },
    end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_TOP + 14 },
    thickness: 0.5,
    color: RULE,
  });
  ctx.page.drawText(footer, {
    x: MARGIN,
    y: FOOTER_TOP,
    size: 8,
    font: ctx.font,
    color: DARK,
  });
}

function ensureSpace(ctx: DrawContext, needed: number) {
  if (ctx.y - needed >= FOOTER_TOP + 18) return false;
  drawPageFooter(ctx);
  ctx.page = ctx.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  return true;
}

function drawLines(
  ctx: DrawContext,
  lines: string[],
  options: { size: number; font: PDFFont; gap?: number },
) {
  const height = options.size + (options.gap ?? LINE_GAP);
  for (const line of lines) {
    ensureSpace(ctx, height);
    if (line) {
      ctx.page.drawText(line, {
        x: MARGIN,
        y: ctx.y - options.size,
        size: options.size,
        font: options.font,
        color: DARK,
      });
    }
    ctx.y -= height;
  }
}

function drawTableHeader(ctx: DrawContext) {
  const size = 9;
  ensureSpace(ctx, size + 10);
  ctx.y -= size;
  ctx.page.drawText("Date", {
    x: MARGIN,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: DARK,
  });
  ctx.page.drawText("Fund", {
    x: MARGIN + 100,
    y: ctx.y,
    size,
    font: ctx.bold,
    color: DARK,
  });
  const amountHeader = "Deductible Amount";
  ctx.page.drawText(amountHeader, {
    x:
      PAGE_WIDTH -
      MARGIN -
      ctx.bold.widthOfTextAtSize(amountHeader, size),
    y: ctx.y,
    size,
    font: ctx.bold,
    color: DARK,
  });
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.8,
    color: DARK,
  });
  ctx.y -= 8;
}

export async function renderContributionStatementPdf(
  snapshot: ContributionStatementPdfSnapshot,
): Promise<Uint8Array> {
  const locale = snapshot.locale?.trim() || "en-US";
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle("Contribution Statement");
  document.setProducer("BITS");
  document.setCreator("BITS");

  const ctx: DrawContext = {
    document,
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    bold,
    y: PAGE_HEIGHT - MARGIN,
    locale,
    identifier: snapshot.statementIdentifier,
    generatedAt: snapshot.generatedAt,
  };

  const orgName = wrapText(snapshot.organization.name, bold, 16, CONTENT_WIDTH);
  drawLines(ctx, orgName, { size: 16, font: bold, gap: 4 });
  ctx.y -= 2;
  drawLines(
    ctx,
    formatStatementPdfAddress(snapshot.organization.address).flatMap((line) =>
      wrapText(line, font, 10, CONTENT_WIDTH),
    ),
    { size: 10, font, gap: 2 },
  );

  ctx.y -= 14;
  drawLines(ctx, wrapText("Contribution Statement", bold, 14, CONTENT_WIDTH), {
    size: 14,
    font: bold,
    gap: 4,
  });
  const typeLabel =
    snapshot.statementType === "HOUSEHOLD" ? "Household" : "Individual";
  drawLines(ctx, wrapText(typeLabel, font, 11, CONTENT_WIDTH), {
    size: 11,
    font,
    gap: 4,
  });

  ctx.y -= 10;
  drawLines(ctx, wrapText("Prepared for", font, 8, CONTENT_WIDTH), {
    size: 8,
    font,
    gap: 2,
  });
  drawLines(ctx, wrapText(snapshot.recipient.name, bold, 12, CONTENT_WIDTH), {
    size: 12,
    font: bold,
    gap: 3,
  });
  drawLines(
    ctx,
    formatStatementPdfAddress(snapshot.recipient.address).flatMap((line) =>
      wrapText(line, font, 10, CONTENT_WIDTH),
    ),
    { size: 10, font, gap: 2 },
  );

  ctx.y -= 10;
  const period = `Period: ${formatStatementPdfDate(snapshot.periodStart, locale)} - ${formatStatementPdfDate(snapshot.periodEnd, locale)}`;
  drawLines(ctx, wrapText(period, font, 10, CONTENT_WIDTH), {
    size: 10,
    font,
    gap: 4,
  });

  ctx.y -= 8;
  drawTableHeader(ctx);

  const amountWidth = 120;
  const fundWidth = CONTENT_WIDTH - 100 - amountWidth - 8;
  const rowSize = 9;
  for (const line of snapshot.lines) {
    const dateText = pdfSafeText(
      formatStatementPdfDate(line.offeringDate, locale),
      font,
    );
    const amountText = pdfSafeText(
      formatStatementPdfMoney(line.deductibleAmount, locale),
      font,
    );
    const fundLines = wrapText(line.fundName, font, rowSize, fundWidth);
    const rowHeight = Math.max(1, fundLines.length) * (rowSize + 2) + 4;
    if (ensureSpace(ctx, rowHeight + 4)) {
      drawTableHeader(ctx);
    }
    const rowTop = ctx.y - rowSize;
    ctx.page.drawText(dateText, {
      x: MARGIN,
      y: rowTop,
      size: rowSize,
      font,
      color: DARK,
    });
    fundLines.forEach((fundLine, index) => {
      ctx.page.drawText(fundLine, {
        x: MARGIN + 100,
        y: rowTop - index * (rowSize + 2),
        size: rowSize,
        font,
        color: DARK,
      });
    });
    ctx.page.drawText(amountText, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(amountText, rowSize),
      y: rowTop,
      size: rowSize,
      font,
      color: DARK,
    });
    ctx.y -= rowHeight;
  }

  ctx.y -= 6;
  ensureSpace(ctx, 36);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.8,
    color: DARK,
  });
  ctx.y -= 14;
  const totalLabel = pdfSafeText("Total deductible contributions", bold);
  const totalAmount = pdfSafeText(
    formatStatementPdfMoney(snapshot.deductibleTotal, locale),
    bold,
  );
  ctx.page.drawText(totalLabel, {
    x: MARGIN,
    y: ctx.y,
    size: 11,
    font: bold,
    color: DARK,
  });
  ctx.page.drawText(totalAmount, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(totalAmount, 11),
    y: ctx.y,
    size: 11,
    font: bold,
    color: DARK,
  });
  ctx.y -= 20;

  if (present(snapshot.footerText)) {
    ctx.y -= 6;
    drawLines(
      ctx,
      wrapText(snapshot.footerText, font, 9, CONTENT_WIDTH),
      { size: 9, font, gap: 3 },
    );
  }

  drawPageFooter(ctx);
  return document.save({ useObjectStreams: false });
}
