/**
 * Bee's Hive — historical bill PDF generator.
 *
 * This module is ONLY for the Billing History -> Download PDF action.
 * It has no connection to the PT-210 / thermal-print path.
 *
 * The PDF is rendered from a dedicated HTML bill at a fixed logical width,
 * then fitted proportionally into one fixed landscape PDF page. The PDF page
 * never changes size based on the bill content, so content cannot spill beyond
 * the right edge or create the portrait/two-page layout that the old renderer
 * produced.
 */
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { Bill, PaymentRecord, Session, Table } from '../../context/RestaurantContext'
import { servingSuffix } from '../../lib/servingType'

export interface BillPdfHeader {
  restaurantName: string
  address: string
  gstin: string
  fssaiLicenseNumber: string
}

export interface HistoricalBillContext {
  table?: Table
  session?: Session
  waiterName?: string
}

const PDF_WIDTH_MM = 210
const PDF_HEIGHT_MM = 166
const PDF_MARGIN_MM = 7
const BILL_WIDTH_PX = 944
const CANVAS_SCALE = 2

const rateFromStored = (amount: number, base: number): number =>
  base > 0 ? Number(((amount / base) * 100).toFixed(2)) : 0

const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const money = (value: number | undefined | null): string =>
  `₹${Number(value ?? 0).toFixed(2)}`

const safeFilePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9-_]/g, '_').trim() || 'bill'

const addressHtml = (value: string): string =>
  escapeHtml(value).replace(/\r?\n/g, '<br />')

const paymentLabel = (value: string | undefined): string =>
  value ? value.replace(/_/g, ' ').toUpperCase() : ''

/**
 * Download a historical bill as a PDF.
 *
 * Nothing here recalculates bill money from current menu/settings data.
 * Stored snapshots are used for all financial values.
 */
export const downloadHistoricalBillPdf = async (
  bill: Bill,
  historical: HistoricalBillContext,
  payment: PaymentRecord | undefined,
  header: BillPdfHeader,
): Promise<void> => {
  const generatedAt = new Date(bill.generatedAt)
  const formattedDate = generatedAt.toLocaleDateString('en-IN')
  const formattedTime = generatedAt.toLocaleTimeString('en-IN')
  const tableName = historical.table?.name ?? bill.tableId ?? 'PARCEL'
  const waiterName = historical.waiterName || 'N/A'
  const guestCount = historical.session?.guestCount ?? 0
  const paymentStatus = payment ? 'PAID' : 'PENDING'
  const paymentMode = paymentLabel(payment?.paymentMode)
  const cgstRate = rateFromStored(bill.cgst, bill.subtotal)
  const sgstRate = rateFromStored(bill.sgst, bill.subtotal)

  const billElement = document.createElement('div')
  billElement.style.position = 'absolute'
  billElement.style.left = '-100000px'
  billElement.style.top = '0'
  billElement.style.width = `${BILL_WIDTH_PX}px`
  billElement.style.margin = '0'
  billElement.style.padding = '28px 32px'
  billElement.style.boxSizing = 'border-box'
  billElement.style.background = '#ffffff'
  billElement.style.color = '#111111'
  billElement.style.fontFamily = 'Arial, Helvetica, sans-serif'
  billElement.style.fontSize = '14px'
  billElement.style.lineHeight = '1.25'
  billElement.style.visibility = 'visible'
  billElement.style.opacity = '1'

  const itemRows = bill.lines.map((line) => {
    const name = `${line.nameSnapshot}${servingSuffix(line.servingType)}`
    const amount = line.priceSnapshot * line.quantity
    return `
      <tr>
        <td style="width:62%; padding:9px 10px 9px 0; border-bottom:1px solid #d7dee8; text-align:left; vertical-align:middle; font-size:14px; line-height:1.25; overflow-wrap:anywhere; word-break:break-word;">
          ${escapeHtml(name)}
        </td>
        <td style="width:13%; padding:9px 4px; border-bottom:1px solid #d7dee8; text-align:center; vertical-align:middle; font-size:14px; white-space:nowrap;">
          ${line.quantity}
        </td>
        <td style="width:25%; padding:9px 0 9px 10px; border-bottom:1px solid #d7dee8; text-align:right; vertical-align:middle; font-size:14px; white-space:nowrap;">
          ${money(amount)}
        </td>
      </tr>
    `
  }).join('')

  billElement.innerHTML = `
    <div style="width:100%; box-sizing:border-box; background:#fff;">

      <div style="text-align:center; padding-bottom:15px;">
        <div style="font-size:30px; line-height:1; font-weight:900; letter-spacing:4px; color:#050505; margin-bottom:7px;">
          ${escapeHtml(header.restaurantName || "BEE'S HIVE").toUpperCase()}
        </div>
        <div style="font-size:11px; line-height:1; letter-spacing:5px; font-weight:800; color:#444; margin-bottom:9px;">
          RESTAURANT
        </div>
        <div style="font-size:12px; line-height:1.35; color:#52627a; margin-bottom:5px;">
          ${addressHtml(header.address || '')}
        </div>
        <div style="font-size:11px; line-height:1.3; font-weight:700; color:#111;">
          <span style="margin-right:24px;">GSTIN: ${escapeHtml(header.gstin || '')}</span>
          <span>FSSAI: ${escapeHtml(header.fssaiLicenseNumber || '')}</span>
        </div>
      </div>

      <div style="height:3px; width:100%; background:#111; margin-bottom:13px;"></div>

      <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0 0 13px 0;">
        <tbody>
          <tr>
            <td style="width:34%; padding:0 12px 8px 0; font-size:12px; font-weight:700; vertical-align:top;">BILL NO: <span style="font-weight:500;">${escapeHtml(bill.billNumber)}</span></td>
            <td style="width:33%; padding:0 12px 8px 0; font-size:12px; font-weight:700; vertical-align:top;">DATE: <span style="font-weight:500;">${escapeHtml(formattedDate)}</span></td>
            <td style="width:33%; padding:0 0 8px 0; font-size:12px; font-weight:700; vertical-align:top;">TIME: <span style="font-weight:500;">${escapeHtml(formattedTime)}</span></td>
          </tr>
          <tr>
            <td style="width:34%; padding:0 12px 0 0; font-size:12px; font-weight:700; vertical-align:top;">TABLE: <span style="font-weight:500;">${escapeHtml(tableName)}</span></td>
            <td style="width:33%; padding:0 12px 0 0; font-size:12px; font-weight:700; vertical-align:top;">WAITER: <span style="font-weight:500;">${escapeHtml(waiterName)}</span></td>
            <td style="width:33%; padding:0; font-size:12px; font-weight:700; vertical-align:top;">GUESTS: <span style="font-weight:500;">${guestCount}</span></td>
          </tr>
        </tbody>
      </table>

      <div style="height:3px; background:#111; width:100%;"></div>

      <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin:0;">
        <colgroup>
          <col style="width:62%;" />
          <col style="width:13%;" />
          <col style="width:25%;" />
        </colgroup>
        <thead>
          <tr>
            <th style="padding:8px 10px 8px 0; border-bottom:3px solid #111; text-align:left; font-size:11px; letter-spacing:2px; font-weight:900;">ITEM</th>
            <th style="padding:8px 4px; border-bottom:3px solid #111; text-align:center; font-size:11px; letter-spacing:2px; font-weight:900;">QTY</th>
            <th style="padding:8px 0 8px 10px; border-bottom:3px solid #111; text-align:right; font-size:11px; letter-spacing:1.5px; font-weight:900;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="display:flex; justify-content:flex-end; margin-top:12px;">
        <table style="width:48%; border-collapse:collapse; table-layout:fixed; font-size:12px; line-height:1.15;">
          <tbody>
            <tr><td style="padding:0 8px 7px 0; text-align:left; white-space:nowrap;">SUBTOTAL</td><td style="padding:0 0 7px 0; text-align:right; white-space:nowrap;">${money(bill.subtotal)}</td></tr>
            ${bill.discount > 0 ? `<tr><td style="padding:0 8px 7px 0; text-align:left; white-space:nowrap;">DISCOUNT</td><td style="padding:0 0 7px 0; text-align:right; white-space:nowrap;">-${money(bill.discount)}</td></tr>` : ''}
            ${bill.serviceCharge > 0 ? `<tr><td style="padding:0 8px 7px 0; text-align:left; white-space:nowrap;">SERVICE CHARGE</td><td style="padding:0 0 7px 0; text-align:right; white-space:nowrap;">${money(bill.serviceCharge)}</td></tr>` : ''}
            ${(bill.parcelCharge ?? 0) > 0 ? `<tr><td style="padding:0 8px 7px 0; text-align:left; white-space:nowrap;">PARCEL CHARGE</td><td style="padding:0 0 7px 0; text-align:right; white-space:nowrap;">${money(bill.parcelCharge)}</td></tr>` : ''}
            <tr><td style="padding:0 8px 7px 0; text-align:left; white-space:nowrap;">CGST ${cgstRate}%</td><td style="padding:0 0 7px 0; text-align:right; white-space:nowrap;">${money(bill.cgst)}</td></tr>
            <tr><td style="padding:0 8px 8px 0; text-align:left; white-space:nowrap;">SGST ${sgstRate}%</td><td style="padding:0 0 8px 0; text-align:right; white-space:nowrap;">${money(bill.sgst)}</td></tr>
            <tr><td colspan="2" style="height:3px; padding:0; background:#111; font-size:0;"></td></tr>
            <tr><td style="padding:9px 8px 0 0; text-align:left; font-size:17px; font-weight:900; white-space:nowrap;">TOTAL</td><td style="padding:9px 0 0 0; text-align:right; font-size:17px; font-weight:900; white-space:nowrap;">${money(bill.grandTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px; border-top:1px solid #d7dee8; padding-top:10px; font-size:12px; font-weight:700;">
        PAYMENT: <span style="font-weight:900;">${paymentStatus}</span>
        ${paymentMode ? `<span style="margin-left:20px; font-weight:500;">MODE: ${escapeHtml(paymentMode)}</span>` : ''}
      </div>

      <div style="margin-top:14px; border-top:1px solid #d7dee8; padding-top:10px; text-align:center; font-size:13px; line-height:1.25; font-weight:700;">
        ${escapeHtml(header.restaurantName || "BEE'S HIVE")} · ${escapeHtml('Thank you for visiting!')}
      </div>

    </div>
  `

  document.body.appendChild(billElement)

  try {
    if (document.fonts?.ready) await document.fonts.ready

    const canvas = await html2canvas(billElement, {
      scale: CANVAS_SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: BILL_WIDTH_PX,
      windowWidth: BILL_WIDTH_PX,
      scrollX: 0,
      scrollY: 0,
    })

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('Unable to render the historical bill.')
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [PDF_WIDTH_MM, PDF_HEIGHT_MM],
      compress: true,
    })

    const availableWidth = PDF_WIDTH_MM - PDF_MARGIN_MM * 2
    const availableHeight = PDF_HEIGHT_MM - PDF_MARGIN_MM * 2
    const widthScale = availableWidth / canvas.width
    const heightScale = availableHeight / canvas.height
    const scale = Math.min(widthScale, heightScale)

    const imageWidth = canvas.width * scale
    const imageHeight = canvas.height * scale
    const imageX = PDF_MARGIN_MM + (availableWidth - imageWidth) / 2
    const imageY = PDF_MARGIN_MM + (availableHeight - imageHeight) / 2

    pdf.addImage(
      canvas.toDataURL('image/png', 1.0),
      'PNG',
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      undefined,
      'FAST',
    )

    pdf.save(`BeeShive-Bill-${safeFilePart(bill.billNumber)}.pdf`)
  } finally {
    billElement.remove()
  }
}

export default downloadHistoricalBillPdf
